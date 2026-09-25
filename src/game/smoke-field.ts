import {Vector3,MathUtils} from 'three';
import type {Vec3} from './types';
import {SMOKE_DURATION,type GrenadeCollision} from './grenades';
export interface SmokeHole {a:Vector3;b:Vector3;radius:number;born:number;duration:number}
const NX=24,NY=16,NZ=24,CELL=.45,N=NX*NY*NZ;
const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
/** One geometry-constrained density field drives both visibility and rendering. */
export class SmokeField {
 readonly size=new Vector3(NX*CELL,NY*CELL,NZ*CELL);readonly dimensions=[NX,NY,NZ]as const;
 readonly center:Vector3;readonly min:Vector3;readonly data=new Uint8Array(N);readonly holes:SmokeHole[]=[];
 private visited=new Uint8Array(N);private queue=new Int32Array(N);private head=0;private tail=0;private neighbor=0;
 age=0;revision=0;queries=0;filled=0;alive=true;readonly origin:Vector3;
 constructor(readonly id:number,origin:Vec3,readonly collision:GrenadeCollision){
  this.origin=new Vector3().copy(origin);this.center=this.origin.clone().add(new Vector3(0,1.9,0));this.min=this.center.clone().addScaledVector(this.size,-.5);
  const start=this.indexAt(this.origin.x,this.origin.y+.18,this.origin.z);this.queue[this.tail++]=start;this.visited[start]=1;
 }
 private index(x:number,y:number,z:number){return x+NX*(y+NY*z);}
 private indexAt(x:number,y:number,z:number){return this.index(MathUtils.clamp(Math.floor((x-this.min.x)/CELL),0,NX-1),MathUtils.clamp(Math.floor((y-this.min.y)/CELL),0,NY-1),MathUtils.clamp(Math.floor((z-this.min.z)/CELL),0,NZ-1));}
 private cell(index:number,target:Vector3){const x=index%NX,y=Math.floor(index/NX)%NY,z=Math.floor(index/(NX*NY));return target.set(this.min.x+(x+.5)*CELL,this.min.y+(y+.5)*CELL,this.min.z+(z+.5)*CELL);}
 bake(budget:number){
  const from=new Vector3(),to=new Vector3();let used=0,dirty=false;
  while(this.head<this.tail&&used<budget){
   const index=this.queue[this.head],x=index%NX,y=Math.floor(index/NX)%NY,z=Math.floor(index/(NX*NY));this.cell(index,from);
   if(!this.data[index]){const d=((from.x-this.center.x)/5.1)**2+((from.y-this.center.y)/2.65)**2+((from.z-this.center.z)/5.1)**2;this.data[index]=Math.round(MathUtils.clamp((1-d)*3,0,1)*255);this.filled++;dirty=true;}
   while(this.neighbor<6&&used<budget){const offset=directions[this.neighbor++],xx=x+offset[0],yy=y+offset[1],zz=z+offset[2];if(xx<0||xx>=NX||yy<0||yy>=NY||zz<0||zz>=NZ)continue;
    const next=this.index(xx,yy,zz);if(this.visited[next])continue;this.cell(next,to);
    if(((to.x-this.center.x)/5.1)**2+((to.y-this.center.y)/2.65)**2+((to.z-this.center.z)/5.1)**2>=1){this.visited[next]=2;continue;}
    used++;this.queries++;if(!this.collision.visible(from,to))continue;
    this.visited[next]=1;this.queue[this.tail++]=next;
   }
   if(this.neighbor===6){this.head++;this.neighbor=0;}
  }
  if(dirty)this.revision++;return used;
 }
 update(dt:number){this.age+=dt;this.alive=this.age<SMOKE_DURATION;for(let i=this.holes.length-1;i>=0;i--)if(this.age-this.holes[i].born>=this.holes[i].duration)this.holes.splice(i,1);}
 get complete(){return this.head>=this.tail;}
 get fade(){return Math.min(1,this.age*1.6,Math.max(0,(SMOKE_DURATION-this.age)/1.5));}
 densityAt(x:number,y:number,z:number){
  if(!this.alive||x<this.min.x||y<this.min.y||z<this.min.z||x>this.min.x+this.size.x||y>this.min.y+this.size.y||z>this.min.z+this.size.z)return 0;
  let density=this.data[this.indexAt(x,y,z)]/255*this.fade;
  for(const hole of this.holes){const dx=hole.b.x-hole.a.x,dy=hole.b.y-hole.a.y,dz=hole.b.z-hole.a.z,l=dx*dx+dy*dy+dz*dz,t=MathUtils.clamp(((x-hole.a.x)*dx+(y-hole.a.y)*dy+(z-hole.a.z)*dz)/Math.max(l,.0001),0,1),distance=Math.hypot(x-hole.a.x-t*dx,y-hole.a.y-t*dy,z-hole.a.z-t*dz),recover=Math.min(1,(hole.duration-(this.age-hole.born))/.35);density*=1-(1-MathUtils.smoothstep(distance,hole.radius*.65,hole.radius))*recover;}
  return density;
 }
 opticalDepth(a:Vec3,b:Vec3){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=Math.hypot(dx,dy,dz);if(!length)return 0;
  // Slab bounds keep distant bot sight queries out of the voxel sampler.
  let start=0,end=1;for(const [p,d,min,size]of [[a.x,dx,this.min.x,this.size.x],[a.y,dy,this.min.y,this.size.y],[a.z,dz,this.min.z,this.size.z]]){if(Math.abs(d)<1e-8){if(p<min||p>min+size)return 0;continue;}const t1=(min-p)/d,t2=(min+size-p)/d;start=Math.max(start,Math.min(t1,t2));end=Math.min(end,Math.max(t1,t2));if(start>=end)return 0;}
  const n=Math.max(1,Math.ceil((end-start)*length/.3)),step=(end-start)/n;let depth=0;
  for(let i=0;i<n;i++){const t=start+(i+.5)*step;depth+=this.densityAt(a.x+dx*t,a.y+dy*t,a.z+dz*t)*length*step*2.5;if(depth>6)return depth;}
  return depth;
 }
 bullet(a:Vec3,b:Vec3){if(this.opticalDepth(a,b)<.05)return;this.addHole(a,b,.22,.45);}
 blast(position:Vec3){if(this.center.distanceTo(position)>8||!this.collision.visible(position,this.origin.clone().add(new Vector3(0,.3,0))))return;this.addHole(position,position,6.3,2);}
 disturb(position:Vec3){if(this.densityAt(position.x,position.y+.2,position.z)>.05)this.addHole(position,position,.55,.25);}
 private addHole(a:Vec3,b:Vec3,radius:number,duration:number){if(this.holes.length>=12)this.holes.shift();this.holes.push({a:new Vector3().copy(a),b:new Vector3().copy(b),radius,born:this.age,duration});}
}
