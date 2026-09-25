import * as THREE from 'three';
import type {GrenadeProjectile} from '../game/grenades';
import type {GrenadeLibrary} from './source2-grenades';
interface Particle {p:THREE.Vector3;v:THREE.Vector3;life:number;kind:'dust'|'blood'|'shell';color:THREE.Color}
export interface Grenade extends GrenadeProjectile {mesh:THREE.Group;persistent?:boolean}
export class Effects {
 private particles:Particle[]=[];private free:Particle[]=[];private capacity=512;
 private positions=new Float32Array(this.capacity*3);private colors=new Float32Array(this.capacity*3);private points:THREE.Points;
 private tracers:{mesh:THREE.Line;life:number}[]=[];private freeTracers:THREE.Line[]=[];
 private decals:THREE.Mesh[]=[];private explosionLight=new THREE.PointLight(0xffad5c,0,14);private lightTime=0;
 grenades:Grenade[]=[];
 constructor(private scene:THREE.Scene,private library:GrenadeLibrary){
  for(let i=0;i<this.capacity;i++)this.free.push({p:new THREE.Vector3(),v:new THREE.Vector3(),life:0,kind:'dust',color:new THREE.Color()});
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  const tex=canvasTexture(64,64,c=>{const g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#fff');g.addColorStop(.25,'#ffffffdc');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,64,64);});
  this.points=new THREE.Points(geometry,new THREE.PointsMaterial({map:tex,vertexColors:true,size:.13,transparent:true,opacity:.85,depthWrite:false}));this.points.frustumCulled=false;scene.add(this.points,this.explosionLight);
 }
 impact(p:THREE.Vector3,n:THREE.Vector3,blood=false){
  for(let i=0;i<(blood?13:9);i++)this.particle(p,new THREE.Vector3((Math.random()-.5)*2+n.x*1.8,Math.random()*2+n.y,(Math.random()-.5)*2+n.z*1.8),.2+Math.random()*.5,blood?'blood':'dust',blood?0x963d2b:0xc9b993);
  if(!blood){const mesh=new THREE.Mesh(new THREE.CircleGeometry(.035+Math.random()*.025,7),new THREE.MeshBasicMaterial({color:0x3f4034,transparent:true,opacity:.65,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));mesh.position.copy(p).addScaledVector(n,.013);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);this.scene.add(mesh);this.decals.push(mesh);if(this.decals.length>70){const old=this.decals.shift()!;old.removeFromParent();old.geometry.dispose();(old.material as THREE.Material).dispose();}}
 }
 shell(p:THREE.Vector3,right:THREE.Vector3){this.particle(p,right.clone().multiplyScalar(2.5).add(new THREE.Vector3(0,1.3,0)),.55,'shell',0xddb876);}
 private particle(p:THREE.Vector3,v:THREE.Vector3,life:number,kind:Particle['kind'],color:number){const particle=this.free.pop()??this.particles.shift()!;particle.p.copy(p);particle.v.copy(v);particle.life=life;particle.kind=kind;particle.color.setHex(color);this.particles.push(particle);}
 tracer(a:THREE.Vector3,b:THREE.Vector3){
  let mesh=this.freeTracers.pop();if(!mesh){if(this.tracers.length>=40)mesh=this.tracers.shift()!.mesh;else{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(6,3).setUsage(THREE.DynamicDrawUsage));mesh=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xebdc9d,transparent:true,opacity:.23,depthWrite:false}));mesh.frustumCulled=false;this.scene.add(mesh);}}
  const p=mesh.geometry.attributes.position;p.setXYZ(0,a.x,a.y,a.z);p.setXYZ(1,b.x,b.y,b.z);p.needsUpdate=true;mesh.visible=true;this.tracers.push({mesh,life:.045});
 }
 explode(p:THREE.Vector3){for(let i=0;i<85;i++)this.particle(p,new THREE.Vector3(Math.random()-.5,Math.random()*.8,Math.random()-.5).normalize().multiplyScalar(3+Math.random()*8),.45+Math.random()*1.1,'dust',i<20?0xffbf64:i<40?0x49433b:0x928b79);this.explosionLight.position.copy(p);this.explosionLight.intensity=120;this.lightTime=.13;}
 grenade(projectile:GrenadeProjectile){
  const root=this.library.world(projectile.kind);
  root.position.copy(projectile.position);this.scene.add(root);const g={...projectile,mesh:root};this.grenades.push(g);return g;
 }
 update(dt:number){
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;if(p.life<=0){this.free.push(p);this.particles[i]=this.particles.at(-1)!;this.particles.pop();continue;}p.v.y-=dt*7;p.p.addScaledVector(p.v,dt);}
  for(let i=0;i<this.particles.length;i++){const p=this.particles[i],fade=Math.min(1,p.life*4),offset=i*3;this.positions[offset]=p.p.x;this.positions[offset+1]=p.p.y;this.positions[offset+2]=p.p.z;this.colors[offset]=p.color.r*fade;this.colors[offset+1]=p.color.g*fade;this.colors[offset+2]=p.color.b*fade;}
  this.points.geometry.attributes.position.needsUpdate=true;this.points.geometry.attributes.color.needsUpdate=true;this.points.geometry.setDrawRange(0,this.particles.length);
  for(let i=this.tracers.length-1;i>=0;i--){const t=this.tracers[i];t.life-=dt;if(t.life<=0){t.mesh.visible=false;this.freeTracers.push(t.mesh);this.tracers.splice(i,1);}}
  if(this.lightTime>0){this.lightTime-=dt;this.explosionLight.intensity=Math.max(0,this.lightTime/.13)*120;}
  for(const g of this.grenades){g.mesh.position.copy(g.position);if(!g.resting)g.mesh.rotation.set(g.rotation*.6,g.rotation*.17,g.rotation);}
 }
 clear(){for(const g of this.grenades)this.removeGrenade(g);this.grenades=[];this.free.push(...this.particles);this.particles=[];this.points.geometry.setDrawRange(0,0);for(const t of this.tracers){t.mesh.visible=false;this.freeTracers.push(t.mesh);}this.tracers=[];this.lightTime=0;this.explosionLight.intensity=0;}
 removeGrenade(g:Grenade){if(!g.persistent)this.releaseModel(g.mesh);}
 releaseModel(mesh:THREE.Group){this.library.release(mesh);}
 decoyPulse(p:THREE.Vector3){for(let i=0;i<3;i++)this.particle(p,new THREE.Vector3((Math.random()-.5)*.5,.3+Math.random(),(Math.random()-.5)*.5),.12,'dust',0xffbb55);}
 get stats(){return{particles:this.particles.length,capacity:this.capacity,tracers:this.tracers.length,projectiles:this.grenades.length};}
}

function canvasTexture(w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void){
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 draw(canvas.getContext('2d')!);const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
