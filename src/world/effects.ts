import * as THREE from 'three';
import { canvasTexture } from './materials';
import type { GrenadeId } from '../game/types';

interface Particle {p:THREE.Vector3;v:THREE.Vector3;life:number;max:number;kind:'dust'|'blood'|'shell';color:THREE.Color}
export interface Smoke { position:THREE.Vector3;life:number;root:THREE.Group;radius:number }
export interface Grenade {kind:GrenadeId;owner:number;position:THREE.Vector3;velocity:THREE.Vector3;life:number;mesh:THREE.Group}
export class Effects {
  private particles:Particle[]=[];
  private capacity=300;
  private positions=new Float32Array(this.capacity*3);
  private colors=new Float32Array(this.capacity*3);
  private points:THREE.Points;
  private tracers:{mesh:THREE.Line;life:number}[]=[];
  private smokeTexture:THREE.CanvasTexture;
  smokes:Smoke[]=[];
  grenades:Grenade[]=[];
  private decals:THREE.Mesh[]=[];
  constructor(private scene:THREE.Scene){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.positions,3));g.setAttribute('color',new THREE.BufferAttribute(this.colors,3));g.setDrawRange(0,0);
    const tex=canvasTexture(64,64,c=>{const gr=c.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'#fff');gr.addColorStop(.25,'#ffffffdc');gr.addColorStop(1,'#ffffff00');c.fillStyle=gr;c.fillRect(0,0,64,64);});
    this.points=new THREE.Points(g,new THREE.PointsMaterial({map:tex,vertexColors:true,size:.13,transparent:true,opacity:.85,depthWrite:false}));this.points.frustumCulled=false;scene.add(this.points);
    this.smokeTexture=canvasTexture(256,256,c=>{
      for(let i=0;i<50;i++){const x=100+Math.random()*56,y=100+Math.random()*56,r=65+Math.random()*44,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(225,225,215,.15)');g.addColorStop(.5,'rgba(205,207,199,.1)');g.addColorStop(1,'rgba(195,199,193,0)');c.fillStyle=g;c.fillRect(0,0,256,256);}
    });
  }
  impact(p:THREE.Vector3,n:THREE.Vector3,blood=false){
    for(let i=0;i<(blood?13:9);i++)this.particle(p,new THREE.Vector3((Math.random()-.5)*2+n.x*1.8,Math.random()*2+n.y,(Math.random()-.5)*2+n.z*1.8),.2+Math.random()*.5,blood?'blood':'dust',blood?0x963d2b:0xc9b993);
    if(!blood){
      const mesh=new THREE.Mesh(new THREE.CircleGeometry(.035+Math.random()*.025,7),new THREE.MeshBasicMaterial({color:0x3f4034,transparent:true,opacity:.65,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
      mesh.position.copy(p).addScaledVector(n,.013);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);this.scene.add(mesh);this.decals.push(mesh);
      if(this.decals.length>70){const old=this.decals.shift()!;this.scene.remove(old);old.geometry.dispose();(old.material as THREE.Material).dispose();}
    }
  }
  shell(p:THREE.Vector3,right:THREE.Vector3){this.particle(p,right.clone().multiplyScalar(2.5).add(new THREE.Vector3(0,1.3,0)),.55,'shell',0xddb876);}
  private particle(p:THREE.Vector3,v:THREE.Vector3,life:number,kind:Particle['kind'],color:number){if(this.particles.length>=this.capacity)this.particles.shift();this.particles.push({p:p.clone(),v,life,max:life,kind,color:new THREE.Color(color)});}
  tracer(a:THREE.Vector3,b:THREE.Vector3){const g=new THREE.BufferGeometry().setFromPoints([a,b]);const mesh=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xebdc9d,transparent:true,opacity:.23,depthWrite:false}));this.scene.add(mesh);this.tracers.push({mesh,life:.045});}
  explode(p:THREE.Vector3){for(let i=0;i<75;i++)this.particle(p,new THREE.Vector3(Math.random()-.5,Math.random()*.8,Math.random()-.5).normalize().multiplyScalar(3+Math.random()*7),.6+Math.random()*.8,'dust',i<20?0xffc885:0xaaa390);const light=new THREE.PointLight(0xffbc75,160,24);light.position.copy(p);this.scene.add(light);setTimeout(()=>this.scene.remove(light),100);}
  smoke(p:THREE.Vector3){
    const root=new THREE.Group();root.position.copy(p);this.scene.add(root);
    for(let i=0;i<20;i++){
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.smokeTexture,transparent:true,opacity:0,depthWrite:false,color:i%3===0?0xbfc3b5:0xd9d7c9,rotation:Math.random()*6}));
      const theta=i*2.4,r=Math.sqrt(i/20)*4.4;sprite.position.set(Math.cos(theta)*r,1.3+(i%4)*.65,Math.sin(theta)*r);sprite.scale.setScalar(6+Math.random()*3);root.add(sprite);
    }
    this.smokes.push({position:p.clone().add(new THREE.Vector3(0,1.8,0)),life:18,root,radius:6});
  }
  smokeBlocked(a:THREE.Vector3,b:THREE.Vector3){
    const ab=b.clone().sub(a),len=ab.lengthSq();
    for(const s of this.smokes){if(s.life<1||s.life>17.4)continue;const t=THREE.MathUtils.clamp(s.position.clone().sub(a).dot(ab)/Math.max(.001,len),0,1);if(a.clone().addScaledVector(ab,t).distanceTo(s.position)<s.radius)return true;}return false;
  }
  grenade(kind:GrenadeId,owner:number,p:THREE.Vector3,v:THREE.Vector3){
    const root=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:kind==='he'?0x5c6744:kind==='flash'?0x777e7c:0x63685f,metalness:.4,roughness:.5});
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.067,.067,.17,10),mat);root.add(body);
    const band=new THREE.Mesh(new THREE.CylinderGeometry(.069,.069,.025,10),new THREE.MeshStandardMaterial({color:kind==='he'?0xcba751:kind==='flash'?0xe0e4dd:0xc16848}));root.add(band);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(.08,.04,.04),mat);cap.position.y=.1;root.add(cap);root.position.copy(p);this.scene.add(root);
    this.grenades.push({kind,owner,position:p.clone(),velocity:v.clone(),life:kind==='smoke'?2.7:1.6,mesh:root});
  }
  update(dt:number){
    this.particles=this.particles.filter(p=>{p.life-=dt;if(p.life<=0)return false;p.v.y-=dt*7;p.p.addScaledVector(p.v,dt);return true;});
    for(let i=0;i<this.particles.length;i++){const p=this.particles[i];this.positions.set(p.p.toArray(),i*3);this.colors.set(p.color.clone().multiplyScalar(Math.min(1,p.life*4)).toArray(),i*3);}
    this.points.geometry.attributes.position.needsUpdate=true;this.points.geometry.attributes.color.needsUpdate=true;this.points.geometry.setDrawRange(0,this.particles.length);
    this.tracers=this.tracers.filter(t=>{t.life-=dt;if(t.life>0)return true;this.scene.remove(t.mesh);t.mesh.geometry.dispose();(t.mesh.material as THREE.Material).dispose();return false;});
    this.smokes=this.smokes.filter(s=>{s.life-=dt;const fade=Math.min(1,(18-s.life)*1.2,s.life*.7);for(const child of s.root.children){const sprite=child as THREE.Sprite;sprite.material.opacity=fade*.58;sprite.material.rotation+=dt*.008;}if(s.life>0)return true;this.scene.remove(s.root);s.root.children.forEach(c=>(c as THREE.Sprite).material.dispose());return false;});
  }
  clear(){for(const s of this.smokes){this.scene.remove(s.root);s.root.children.forEach(c=>(c as THREE.Sprite).material.dispose());}this.smokes=[];for(const g of this.grenades)this.removeGrenade(g);this.grenades=[];this.particles=[];}
  removeGrenade(g:Grenade){this.scene.remove(g.mesh);g.mesh.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});}
}
