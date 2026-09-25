import*as THREE from'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{MeshoptDecoder}from'three/addons/libs/meshopt_decoder.module.js';import{clone as cloneSkeleton}from'three/addons/utils/SkeletonUtils.js';
import{NativeAnimation,attachWeaponToViewmodel,type ClipAsset}from'./source2-weapons';import type{WeaponAction}from'./models';import{bakeStaticProp}from'./static-prop';
export class C4Library{
 readonly view=new THREE.Group();readonly animation:NativeAnimation;private code='';private display:THREE.CanvasTexture;private canvas:HTMLCanvasElement;
 readonly plantedRotation=new THREE.Quaternion();
 constructor(private model:THREE.Group,private kitModel:THREE.Group,arms:THREE.Group,clips:Partial<Record<WeaponAction,ClipAsset>>,sound:(name:string)=>void,readonly root:string){
  this.canvas=document.createElement('canvas');this.canvas.width=512;this.canvas.height=128;this.display=new THREE.CanvasTexture(this.canvas);this.display.flipY=false;this.display.colorSpace=THREE.SRGBColorSpace;this.display.repeat.x=-1;this.display.offset.x=1;
  this.model.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.userData.source2Shared=true;o.frustumCulled=false;o.castShadow=o.receiveShadow=true;const prepare=(m:THREE.Material)=>{if(m.name.includes('panorama_control')){const screen=new THREE.MeshBasicMaterial({map:this.display,color:0xffffff,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});screen.name=m.name;return screen;}return m;};o.material=Array.isArray(o.material)?o.material.map(prepare):prepare(o.material);}});
  const content=new THREE.Group(),hands=cloneSkeleton(arms),gun=cloneSkeleton(model)as THREE.Group;content.rotation.y=Math.PI;this.view.add(content);content.add(hands);attachWeaponToViewmodel(hands,gun);this.animation=new NativeAnimation(content,clips,sound);
  this.model=bakeStaticProp(model);this.kitModel=bakeStaticProp(kitModel);
  const face=new THREE.Vector3(),screenCenter=new THREE.Vector3();let screenVertices=0;this.model.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.some(m=>m.name.includes('panorama_control'))){const normals=o.geometry.attributes.normal;for(let i=0;i<normals.count;i++)face.add(new THREE.Vector3().fromBufferAttribute(normals,i));const positions=o.geometry.attributes.position;for(let i=0;i<positions.count;i++){screenCenter.add(new THREE.Vector3().fromBufferAttribute(positions,i));screenVertices++;}}});
  if(face.lengthSq()>.001)this.plantedRotation.setFromUnitVectors(face.normalize().negate(),new THREE.Vector3(0,1,0));
  if(screenVertices){screenCenter.divideScalar(screenVertices).applyQuaternion(this.plantedRotation);this.plantedRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(screenCenter.x,-screenCenter.z)));}
  this.setDisplay('');
 }
 world(){return this.model.clone(true);}
 kit(){return this.kitModel.clone(true);}
 setDisplay(code:string){if(code===this.code&&this.display.version>1)return;this.code=code;const c=this.canvas.getContext('2d')!;c.fillStyle='#233321';c.fillRect(0,0,512,128);c.fillStyle='#c4d492';c.font='bold 82px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(code||'*******',256,68);this.display.needsUpdate=true;}
 place(world:THREE.Group,point:THREE.Vector3,normal:THREE.Vector3,yaw:number){
  world.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw)).multiply(this.plantedRotation);
  world.position.set(0,0,0);world.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(world);world.position.copy(point);world.position.y+=-bounds.min.y+.008;world.visible=true;
 }
 prewarmModels(){return[this.model,this.kitModel];}
}
export async function loadSource2C4(arms:THREE.Group,sound:(name:string)=>void){
 const root=`${import.meta.env.BASE_URL}assets/source2/c4/`,response=await fetch(root+'manifest.json');if(!response.ok)throw new Error('原始 C4 资源未准备完成');const manifest=await response.json(),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),[model,kit]=await Promise.all([loader.loadAsync(root+manifest.model),loader.loadAsync(root+manifest.kit)]),clips:Partial<Record<WeaponAction,ClipAsset>>={};
 for(const[role,data]of Object.entries(manifest.clips)as[WeaponAction,any][]){const gltf=await loader.loadAsync(root+data.file);clips[role]={clip:gltf.animations[0],data};}
 return new C4Library(model.scene,kit.scene,arms,clips,sound,root);
}
