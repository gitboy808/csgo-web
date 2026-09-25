import * as THREE from 'three';
import {SmokeField} from '../game/smoke-field';
import type {Side} from '../game/types';
const vertex=`void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragment=`precision highp float;precision highp sampler3D;
uniform sampler3D uField;uniform sampler3D uNoise;uniform sampler2D uDepth;
uniform mat4 uInverseProjection;uniform mat4 uCameraWorld;uniform vec3 uCamera;uniform vec3 uMin;uniform vec3 uSize;uniform vec2 uResolution;
uniform float uNear;uniform float uFar;uniform float uAge;uniform float uFade;uniform int uSteps;uniform int uHoleCount;uniform vec4 uHolesA[12];uniform vec4 uHolesB[12];uniform vec3 uTint;
out vec4 outColor;
float density(vec3 p){vec3 q=(p-uMin)/uSize;if(any(lessThan(q,vec3(0.0)))||any(greaterThan(q,vec3(1.0))))return 0.0;float d=texture(uField,q).r;
 float n=texture(uNoise,p*.035+vec3(uAge*.0027,uAge*-.004,0)).r;float detail=texture(uNoise,p*.115+vec3(0,uAge*.008,0)).r;d*=smoothstep(.2,.72,n*.72+detail*.28)*uFade;
 for(int j=0;j<12;j++){if(j>=uHoleCount)break;vec3 ba=uHolesB[j].xyz-uHolesA[j].xyz;float t=clamp(dot(p-uHolesA[j].xyz,ba)/max(dot(ba,ba),.0001),0.0,1.0);float dist=length(p-uHolesA[j].xyz-ba*t);d*=1.0-(1.0-smoothstep(uHolesA[j].w*.65,uHolesA[j].w,dist))*uHolesB[j].w;}return d;}
void main(){vec2 uv=gl_FragCoord.xy/uResolution;vec4 view=uInverseProjection*vec4(uv*2.0-1.0,1,1);vec3 viewRay=normalize(view.xyz/view.w);vec3 ray=normalize(mat3(uCameraWorld)*viewRay);
 vec3 inv=1.0/(ray+vec3(.0000001));vec3 a=(uMin-uCamera)*inv,b=(uMin+uSize-uCamera)*inv;vec3 lo=min(a,b),hi=max(a,b);float start=max(max(lo.x,lo.y),max(lo.z,0.0)),end=min(hi.x,min(hi.y,hi.z));
 float depth=texture(uDepth,uv).r;float viewDepth=(uNear*uFar)/((uFar-uNear)*depth-uFar);end=min(end,viewDepth/min(viewRay.z,-.0001)-.02);if(start>=end)discard;
 float stepSize=(end-start)/float(uSteps),jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);float transmittance=1.0;vec3 color=vec3(0.0);
 for(int i=0;i<64;i++){if(i>=uSteps||transmittance<.015)break;vec3 p=uCamera+ray*(start+(float(i)+jitter)*stepSize);float d=density(p);if(d<.006)continue;
 float shade=texture(uField,(p+vec3(-.45,.9,-.25)-uMin)/uSize).r*smoothstep(.15,.65,texture(uNoise,(p+vec3(-.45,.9,-.25))*.035+vec3(uAge*.0027,uAge*-.004,0)).r);float height=clamp((p.y-uMin.y)/uSize.y,0.,1.);vec3 light=uTint*(.35+.48*height+.27*(1.0-shade));float alpha=1.0-exp(-d*stepSize*3.8);color+=transmittance*alpha*light;transmittance*=1.0-alpha;}
 outColor=vec4(color,1.0-transmittance);}`;
interface Cloud {field:SmokeField;mesh:THREE.Mesh;texture:THREE.Data3DTexture;revision:number;material:THREE.ShaderMaterial}
/** One low-resolution volume pass; no extra world/depth pass and no smoke shadows. */
export class VolumetricSmoke {
 readonly scene=new THREE.Scene();private geometry=new THREE.BoxGeometry(1,1,1);private clouds:Cloud[]=[];private target:THREE.WebGLRenderTarget|null=null;private noise:THREE.Data3DTexture;
 constructor(){const data=new Uint8Array(32**3);let seed=0x1938a5;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=(seed>>>24)&255;}this.noise=new THREE.Data3DTexture(data,32,32,32);this.noise.format=THREE.RedFormat;this.noise.minFilter=this.noise.magFilter=THREE.LinearFilter;this.noise.wrapS=this.noise.wrapT=this.noise.wrapR=THREE.RepeatWrapping;this.noise.unpackAlignment=1;this.noise.needsUpdate=true;}
 add(field:SmokeField,side:Side){
  const [x,y,z]=field.dimensions,texture=new THREE.Data3DTexture(field.data,x,y,z);texture.format=THREE.RedFormat;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
  const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,transparent:true,premultipliedAlpha:true,side:THREE.BackSide,depthWrite:false,depthTest:false,toneMapped:false,uniforms:{uField:{value:texture},uNoise:{value:this.noise},uDepth:{value:null},uInverseProjection:{value:new THREE.Matrix4()},uCameraWorld:{value:new THREE.Matrix4()},uCamera:{value:new THREE.Vector3()},uMin:{value:field.min},uSize:{value:field.size},uResolution:{value:new THREE.Vector2()},uNear:{value:.07},uFar:{value:2500},uAge:{value:0},uFade:{value:0},uSteps:{value:40},uHoleCount:{value:0},uHolesA:{value:Array.from({length:12},()=>new THREE.Vector4())},uHolesB:{value:Array.from({length:12},()=>new THREE.Vector4())},uTint:{value:new THREE.Color(side==='CT'?0xa7b2b5:0xb6b1a3)}}});
  const mesh=new THREE.Mesh(this.geometry,material);mesh.position.copy(field.center);mesh.scale.copy(field.size);mesh.castShadow=mesh.receiveShadow=false;this.scene.add(mesh);this.clouds.push({field,texture,mesh,material,revision:-1});
 }
 update(){for(let i=this.clouds.length-1;i>=0;i--){const c=this.clouds[i];if(!c.field.alive){this.scene.remove(c.mesh);c.texture.dispose();c.material.dispose();this.clouds.splice(i,1);continue;}if(c.revision!==c.field.revision){c.revision=c.field.revision;c.texture.needsUpdate=true;}}}
 private frustum=new THREE.Frustum();private projection=new THREE.Matrix4();private box=new THREE.Box3();private warm:THREE.ShaderMaterial|null=null;
 get active(){return this.clouds.length>0;}
 visible(camera:THREE.Camera){camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));return this.clouds.some(c=>{this.box.min.copy(c.field.min);this.box.max.copy(c.field.min).add(c.field.size);return c.field.fade>.005&&this.frustum.intersectsBox(this.box);});}
 // Retain the material to keep its compiled GPU program cached across rounds.
 async prewarm(renderer:THREE.WebGLRenderer,camera:THREE.Camera){if(this.warm)return;const dummy=new SmokeField(-1,new THREE.Vector3(),{visible:()=>true,sweep:()=>null,ground:()=>null});this.add(dummy,'CT');const target=renderer.getRenderTarget(),scratch=new THREE.WebGLRenderTarget(1,1);try{renderer.setRenderTarget(scratch);await renderer.compileAsync(this.scene,camera);}finally{renderer.setRenderTarget(target);scratch.dispose();const cloud=this.clouds.pop()!;this.scene.remove(cloud.mesh);this.warm=cloud.material;cloud.texture.dispose();}}
 render(renderer:THREE.WebGLRenderer,camera:THREE.PerspectiveCamera,depth:THREE.DepthTexture,width:number,height:number,quality:'high'|'medium'|'low'){
  const ratio=quality==='high'?.5:quality==='medium'?.4:.32,w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
  if(!this.target)this.target=new THREE.WebGLRenderTarget(w,h,{type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,depthBuffer:false});else if(this.target.width!==w||this.target.height!==h)this.target.setSize(w,h);
  camera.updateMatrixWorld();
  for(const {field,material}of this.clouds){const u=material.uniforms;u.uDepth.value=depth;u.uInverseProjection.value.copy(camera.projectionMatrixInverse);u.uCameraWorld.value.copy(camera.matrixWorld);u.uCamera.value.copy(camera.position);u.uResolution.value.set(w,h);u.uNear.value=camera.near;u.uFar.value=camera.far;u.uAge.value=field.age;u.uFade.value=field.fade;u.uSteps.value=quality==='high'?40:quality==='medium'?32:24;u.uHoleCount.value=field.holes.length;field.holes.forEach((hole,i)=>{u.uHolesA.value[i].set(hole.a.x,hole.a.y,hole.a.z,hole.radius);u.uHolesB.value[i].set(hole.b.x,hole.b.y,hole.b.z,Math.min(1,(hole.duration-(field.age-hole.born))/.35));});}
  const previous=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();renderer.setRenderTarget(this.target);renderer.setClearColor(0,0);renderer.clear();renderer.render(this.scene,camera);renderer.setClearColor(color,alpha);renderer.setRenderTarget(previous);return this.target.texture;
 }
 clear(){for(const c of this.clouds){this.scene.remove(c.mesh);c.texture.dispose();c.material.dispose();}this.clouds=[];}
 get stats(){return{clouds:this.clouds.length,voxels:this.clouds.reduce((n,c)=>n+c.field.data.length,0),width:this.target?.width??0,height:this.target?.height??0};}
}
