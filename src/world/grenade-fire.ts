import * as THREE from 'three';
import type {FirePatch} from '../game/grenade-hazards';
const CAPACITY=840;
/** All visible flame cells share one atlas, one geometry and one instanced draw. */
export class GrenadeFire {
 private geometry:THREE.InstancedBufferGeometry;private mesh:THREE.Mesh;private material:THREE.ShaderMaterial;
 private positions=new Float32Array(CAPACITY*3);private params=new Float32Array(CAPACITY*4);
 constructor(scene:THREE.Scene){
  const quad=new THREE.PlaneGeometry(1,1);quad.translate(0,.5,0);this.geometry=new THREE.InstancedBufferGeometry();this.geometry.index=quad.index;this.geometry.attributes.position=quad.attributes.position;this.geometry.attributes.uv=quad.attributes.uv;this.geometry.setAttribute('instancePosition',new THREE.InstancedBufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));this.geometry.setAttribute('instanceParams',new THREE.InstancedBufferAttribute(this.params,4).setUsage(THREE.DynamicDrawUsage));this.geometry.instanceCount=0;
  this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uAtlas:{value:null},uNative:{value:0},uRight:{value:new THREE.Vector3(1,0,0)}},vertexShader:`attribute vec3 instancePosition;attribute vec4 instanceParams;uniform vec3 uRight;varying vec2 vUv;varying vec4 vParams;void main(){vUv=uv;vParams=instanceParams;vec3 p=instancePosition+uRight*position.x*instanceParams.x+vec3(0,position.y*instanceParams.y,0);gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,fragmentShader:`uniform sampler2D uAtlas;uniform float uNative;varying vec2 vUv;varying vec4 vParams;void main(){float frame=floor(mod(vParams.z,32.))+floor(vParams.w*4.)*32.;float col=mod(frame,8.),row=floor(frame/8.);vec2 uv=vec2((col+vUv.x)/8.,1.-(row+1.-vUv.y)/16.);vec4 fire=uNative>.5?texture2D(uAtlas,uv):vec4(1.,.35,.03,exp(-pow((vUv.x-.5)*(2.+2.*vUv.y),2.)*8.)*(1.-vUv.y));float alpha=fire.a*smoothstep(0.,.07,vUv.y);if(alpha<.015)discard;gl_FragColor=vec4(fire.rgb*1.65,alpha*.92);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.castShadow=false;this.mesh.renderOrder=2;scene.add(this.mesh);
 }
 async load(){const texture=await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}assets/source2/grenades/vfx/fire.webp`);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;this.material.uniforms.uAtlas.value=texture;this.material.uniforms.uNative.value=1;}
 update(patches:FirePatch[],camera:THREE.Camera){
  const right=this.material.uniforms.uRight.value as THREE.Vector3;right.setFromMatrixColumn(camera.matrixWorld,0);right.y=0;right.normalize();let count=0;
  for(const patch of patches){const endFade=Math.min(1,(patch.duration-patch.age)/1.2);for(const cell of patch.cells){const age=patch.age-cell.start;if(cell.extinguished||age<0||count>=CAPACITY)continue;const grow=Math.min(1,age*5),height=(.85+cell.seed*.7)*grow*endFade*(1-.35*patch.age/patch.duration),i=count++;
    this.positions[i*3]=cell.position.x;this.positions[i*3+1]=cell.position.y;this.positions[i*3+2]=cell.position.z;this.params[i*4]=1.1+cell.seed*.55;this.params[i*4+1]=height;this.params[i*4+2]=age*25+cell.seed*32;this.params[i*4+3]=cell.seed;
  }}
  this.geometry.instanceCount=count;this.mesh.visible=count>0;if(count){this.geometry.attributes.instancePosition.needsUpdate=true;this.geometry.attributes.instanceParams.needsUpdate=true;}
 }
 get instances(){return this.geometry.instanceCount;}
}
