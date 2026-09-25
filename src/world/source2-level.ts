import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Source2MapData } from './source2-types';
import { batchStaticMap } from './source2-batching';
import {source2WorldMatrix} from './source2-transform';
import {Source2Layers} from './source2-layers';
import {StaticShadowCache} from './source2-shadows';
import {restoreSurfaceGeometry,adaptSurfaceDepth,isSourceOverlay} from './source2-surfaces';

export async function loadSource2Map():Promise<Source2MapData>{
  const response=await fetch(`${import.meta.env.BASE_URL}assets/source2/map.json`);
  if(!response.ok)throw new Error('CS2 原地图资源尚未准备完成。请运行本地素材准备脚本。');
  const data=await response.json();if(data.format!==1||!data.navigation?.length||!data.collision?.groups?.length)throw new Error('CS2 地图数据不完整。');
  return data;
}

export class Source2Level {
  readonly group=new THREE.Group();
  readonly sun:THREE.DirectionalLight;
  readonly layers:Source2Layers;
  shadows:StaticShadowCache|null=null;
  minimumReceiverY=-100;
  readonly surfaceRepairs={geometries:0,materials:0};
  private rootUrl=`${import.meta.env.BASE_URL}assets/source2/`;
  private irradiance:THREE.DataTexture|null=null;
  private lightmapVariants=new Map<number,THREE.Texture>();
  private materialVariants=new Map<string,THREE.Material>();
  private effectMasks=new Map<string,THREE.Texture>();
  private effectTime={value:0};
  stats={meshes:0,triangles:0,materials:0,lightmapped:0,batchedObjects:0,batches:0};
  constructor(readonly scene:THREE.Scene,readonly renderer:THREE.WebGLRenderer,readonly data:Source2MapData){
    this.layers=new Source2Layers(scene);
    this.group.name='CS2 Dust II — original geometry';this.group.matrix.copy(source2WorldMatrix());this.group.matrixAutoUpdate=false;scene.add(this.group);
    this.layers.background.background=new THREE.Color(0xaac7de);scene.background=null;scene.fog=new THREE.Fog(0xc6d4da,160,1500);this.layers.background.fog=scene.fog.clone();
    const pitch=THREE.MathUtils.degToRad(data.sun.pitch),yaw=THREE.MathUtils.degToRad(data.sun.yaw);
    const incoming=new THREE.Vector3(Math.cos(pitch)*Math.cos(yaw),-Math.sin(pitch),-Math.cos(pitch)*Math.sin(yaw));
    const color=new THREE.Color().setRGB(...data.sun.color.map(v=>v/255)as[number,number,number],THREE.SRGBColorSpace);
    this.sun=new THREE.DirectionalLight(color,data.sun.intensity);
    this.sun.position.copy(incoming).multiplyScalar(-130);this.sun.target.position.set(0,0,-30);this.sun.position.add(this.sun.target.position);
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(4096,4096);this.sun.shadow.bias=-.00006;this.sun.shadow.normalBias=.025;
    Object.assign(this.sun.shadow.camera,{left:-79,right:79,top:79,bottom:-79,near:1,far:280});this.sun.shadow.camera.updateProjectionMatrix();scene.add(this.sun,this.sun.target);
    const skyColor=new THREE.Color().setRGB(...data.sun.skyColor.map(v=>v/255)as[number,number,number],THREE.SRGBColorSpace);
    scene.add(new THREE.HemisphereLight(skyColor,0x8c7962,data.lightmap?.35:1.15));
    const distantSun=this.sun.clone();distantSun.castShadow=false;this.layers.background.add(distantSun,distantSun.target,new THREE.HemisphereLight(skyColor,0x8c7962,1.15));
    const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment();scene.environment=pmrem.fromScene(environment,.03).texture;scene.environmentIntensity=.25;environment.dispose();pmrem.dispose();
  }
  async load(progress:(fraction:number,label:string)=>void){
    const manager=new THREE.LoadingManager();manager.onProgress=(_url,loaded,total)=>progress(Math.min(.95,loaded/Math.max(1,total)*.92),`载入 CS2 原始材质 ${loaded} / ${total}`);
    const loader=new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
    if(this.data.skyTexture){
      const sky=await new EXRLoader(manager).setDataType(THREE.HalfFloatType).loadAsync(this.rootUrl+this.data.skyTexture);
      sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.LinearSRGBColorSpace;
      this.layers.background.background=sky;this.layers.background.backgroundIntensity=1.2;
      const pmrem=new THREE.PMREMGenerator(this.renderer);this.scene.environment?.dispose();this.scene.environment=pmrem.fromEquirectangular(sky).texture;pmrem.dispose();
    }
    if(this.data.effects){const textureLoader=new THREE.TextureLoader(manager);await Promise.all(Object.entries(this.data.effects).map(async([name,file])=>{const texture=await textureLoader.loadAsync(this.rootUrl+file);texture.flipY=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;this.effectMasks.set(name,texture);}));}
    if(this.data.lightmap){
      progress(.01,'载入原始烘焙光照');
      this.irradiance=await new EXRLoader().setDataType(THREE.HalfFloatType).loadAsync(this.rootUrl+this.data.lightmap);
      this.irradiance.flipY=false;this.irradiance.channel=1;this.irradiance.colorSpace=THREE.LinearSRGBColorSpace;this.irradiance.minFilter=THREE.LinearFilter;this.irradiance.magFilter=THREE.LinearFilter;
      // EXRLoader reverses scanline order; Source/glTF lightmap UVs use the PNG orientation.
      this.irradiance.repeat.set(1,-1);this.irradiance.offset.set(0,1);this.irradiance.updateMatrix();
    }
    const gltf=await loader.loadAsync(this.rootUrl+this.data.model,event=>{if(event.total)progress(event.loaded/event.total*.16,'载入 Dust II 原始几何');});
    this.prepare(gltf.scene,false);this.group.add(gltf.scene);
    if(this.irradiance&&!this.stats.lightmapped)throw new Error('原始光照 UV 缺失，请重新运行原图打包脚本。');
    if(this.data.skybox){
      progress(.95,'载入远景城市');const sky=await loader.loadAsync(this.rootUrl+this.data.skybox.model);this.prepare(sky.scene,true);
      this.layers.addSkybox(sky.scene,this.data.skybox);this.layers.background.environment=this.scene.environment;this.layers.background.environmentIntensity=this.scene.environmentIntensity;
    }
    this.minimumReceiverY=new THREE.Box3().setFromObject(this.group).min.y;
    this.shadows=new StaticShadowCache(this.group,this.scene,this.sun);
    progress(1,'CS2 原始地图已载入');
  }
  render(renderer:THREE.WebGLRenderer,camera:THREE.Camera){if(this.shadows)this.shadows.render(renderer,camera,()=>this.layers.render(renderer,camera));else this.layers.render(renderer,camera);}
  private prepare(root:THREE.Object3D,skybox:boolean){
    const remove:THREE.Object3D[]=[];
    root.traverse(object=>{
      if(object instanceof THREE.Light){remove.push(object);return;}
      if(!(object instanceof THREE.Mesh))return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(materials.every(m=>/tools(?:nodraw|blocklight|solidblocklight|invisible|skybox|clip|playerclip|hint|skip|trigger)|dev_measure|toolstrigger/.test(m.name))){remove.push(object);return;}
      if(restoreSurfaceGeometry(object))this.surfaceRepairs.geometries++;
      const uv=object.geometry.hasAttribute('uv2')?2:object.geometry.hasAttribute('uv1')?1:0;
      object.material=materials.map(original=>{
        const mat=original as THREE.MeshStandardMaterial,key=`${mat.uuid}:${uv}:${skybox}`;const cached=this.materialVariants.get(key);if(cached)return cached;
        const result=mat.clone(),vmat=result.userData.vmat||{},shader=String(vmat.ShaderName||'');
        // Exported ORM textures set metallicFactor=1 even for nonmetal materials.
        // Restore the original material's value instead of turning plaster into metal.
        result.metalness=THREE.MathUtils.clamp(vmat.FloatParams?.g_flMetalness??vmat.VectorParams?.TextureMetalness?.[0]??0,0,1);
        // Source foliage stores wind weights in vertex colors; they are not RGB tint.
        if(vmat.IntParams?.F_VERTEX_ANIMATION||shader==='csgo_foliage.vfx')result.vertexColors=false;
        if(vmat.IntParams?.F_NOTINT){const tint=vmat.VectorParams?.g_vColorTint||[1,1,1];result.color.setRGB(tint[0],tint[1],tint[2],THREE.SRGBColorSpace);result.vertexColors=false;}
        if(shader.includes('effects')){const effect=this.makeEffect(mat,vmat,object.geometry.hasAttribute('color'));this.materialVariants.set(key,effect);return effect;}
        if(shader==='csgo_unlitgeneric.vfx'||shader==='csgo_black_unlit.vfx'){
          // Source's sky clouds use F_BLEND_MODE, which the glTF exporter omits.
          const unlit=new THREE.MeshBasicMaterial({name:mat.name,map:shader==='csgo_black_unlit.vfx'?null:mat.map,color:shader==='csgo_black_unlit.vfx'?0:mat.color,vertexColors:result.vertexColors,side:mat.side,transparent:!!vmat.IntParams?.F_BLEND_MODE||mat.transparent,opacity:mat.opacity,alphaTest:mat.alphaTest,fog:vmat.IntParams?.g_bFogEnabled!==0});
          unlit.depthWrite=!unlit.transparent;this.materialVariants.set(key,unlit);return unlit;
        }
        for(const property of ['map','normalMap','roughnessMap','metalnessMap','aoMap']as const)if(result[property])result[property]!.anisotropy=8;
        result.envMapIntensity=skybox?.2:.3;
        adaptSurfaceDepth(result,vmat);if(result.polygonOffset)this.surfaceRepairs.materials++;
        if(isSourceOverlay(vmat)&&[3,5,6].includes(vmat.IntParams?.F_BLEND_MODE)){
          const decal=new THREE.MeshBasicMaterial({name:mat.name,map:mat.map,color:result.color,vertexColors:result.vertexColors,side:mat.side,opacity:mat.opacity,toneMapped:false});
          decal.userData={...result.userData};adaptSurfaceDepth(decal,vmat);this.materialVariants.set(key,decal);return decal;
        }
        if(this.irradiance&&uv&&!skybox&&!/effects|overlay|decal|foliage/.test(shader)&&!vmat.IntParams?.F_OVERLAY){
          let lm=this.lightmapVariants.get(uv);if(!lm){lm=this.irradiance.clone();lm.channel=uv;this.lightmapVariants.set(uv,lm);}result.lightMap=lm;result.lightMapIntensity=1;this.stats.lightmapped++;
        }
        result.needsUpdate=true;this.materialVariants.set(key,result);return result;
      });
      if(!Array.isArray(object.material)||object.material.length===1)object.material=(object.material as THREE.Material[])[0];
      const prepared=Array.isArray(object.material)?object.material:[object.material];
      object.castShadow=!skybox&&prepared.some(m=>m.visible)&&!prepared.some(m=>m.transparent||m.userData.source2NoShadow);object.receiveShadow=!skybox;
      if(prepared.every(m=>isSourceOverlay(m.userData.vmat??{})))object.renderOrder=10;
      object.frustumCulled=true;object.matrixAutoUpdate=false;object.updateMatrix();this.stats.meshes++;this.stats.triangles+=(object.geometry.index?.count||object.geometry.attributes.position.count)/3;
    });
    remove.forEach(object=>object.removeFromParent());this.stats.materials=this.materialVariants.size;
    if(this.renderer.extensions.has('WEBGL_multi_draw')){const batched=batchStaticMap(root);this.stats.batchedObjects+=batched.objects;this.stats.batches+=batched.batches;}
  }
  update(time:number){this.effectTime.value=time;}
  private makeEffect(original:THREE.MeshStandardMaterial,source:any,vertexAlpha:boolean):THREE.ShaderMaterial{
    const textures=source.TextureParams||{},vectors=source.VectorParams||{},floats=source.FloatParams||{},mask1=this.effectMasks.get(textures.g_tMask1),mask2=this.effectMasks.get(textures.g_tMask2);
    const vec=(name:string,fallback:number[])=>new THREE.Vector2(...(vectors[name]||fallback).slice(0,2)as[number,number]);
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:source.IntParams?.F_ADDITIVE_BLEND?THREE.AdditiveBlending:THREE.NormalBlending,
      defines:vertexAlpha?{USE_SOURCE_ALPHA:1}:{},uniforms:{time:this.effectTime,effectColor:{value:original.color.clone()},map:{value:original.map},mask1:{value:mask1},mask2:{value:mask2},maskScale1:{value:vec('g_vMask1Scale',[1,1])},maskScale2:{value:vec('g_vMask2Scale',[1,1])},pan1:{value:vec('g_vMask1PanSpeed',[0,0])},pan2:{value:vec('g_vMask2PanSpeed',[0,0])},opacity:{value:Math.min(.2,(floats.g_flOpacityScale??1)*.16)},fadeDistance:{value:(floats.g_flFadeDistance??200)*.0254}},
      vertexShader:`varying vec2 vUv;varying float vDepth;varying float vAlpha;
      #ifdef USE_SOURCE_ALPHA
      attribute vec4 color;
      #endif
      void main(){vUv=uv;vAlpha=1.0;
      #ifdef USE_SOURCE_ALPHA
      vAlpha=color.a;
      #endif
      vec4 mv=modelViewMatrix*vec4(position,1.0);vDepth=-mv.z;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform sampler2D map,mask1,mask2;uniform vec3 effectColor;uniform vec2 maskScale1,maskScale2,pan1,pan2;uniform float time,opacity,fadeDistance;varying vec2 vUv;varying float vDepth;varying float vAlpha;
      void main(){vec4 base=texture2D(map,vUv);float a=texture2D(mask1,vUv*maskScale1+pan1*time).r*texture2D(mask2,vUv*maskScale2+pan2*time).r;float edge=smoothstep(0.0,.04,min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y)));a*=base.a*vAlpha*edge*opacity*smoothstep(.2,max(.3,fadeDistance),vDepth);if(a<.001)discard;gl_FragColor=vec4(base.rgb*effectColor,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    });
    material.name=original.name;material.visible=!!mask1&&!!mask2;return material;
  }
}
