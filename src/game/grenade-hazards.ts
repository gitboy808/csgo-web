import {Vector3,MathUtils} from 'three';
import type {Side,Vec3,WeaponId} from './types';
import {GRENADES,type GrenadeCollision} from './grenades';
import {SmokeField} from './smoke-field';
export interface FireCell {position:Vector3;start:number;extinguished:boolean;seed:number}
export interface FirePatch {id:number;owner:number;kind:'molotov'|'incendiary';age:number;duration:number;cells:FireCell[];alive:boolean;sounded:boolean}
export interface Decoy {id:number;owner:number;position:Vector3;age:number;nextShot:number;weapon:WeaponId;alive:boolean}
export class GrenadeHazards {
 smokes:SmokeField[]=[];fires:FirePatch[]=[];decoys:Decoy[]=[];private id=0;
 constructor(readonly collision:GrenadeCollision,readonly onSmoke:(field:SmokeField,side:Side)=>void,readonly extinguish:(position:Vector3)=>void){}
 addSmoke(position:Vec3,side:Side){if(this.smokes.length>=10)this.smokes.shift()!.alive=false;const field=new SmokeField(++this.id,position,this.collision);field.bake(128);this.smokes.push(field);this.onSmoke(field,side);return field;}
 addFire(position:Vec3,kind:'molotov'|'incendiary',owner:number){
  if(this.fires.length>=10)this.fires.shift()!.alive=false;const d=GRENADES[kind],patch:FirePatch={id:++this.id,owner,kind,age:0,duration:d.burnTime,cells:[],alive:true,sounded:false};
  const root=new Vector3().copy(position),queue=[{x:0,z:0,position:root}],visited=new Set<string>(['0,0']);const spacing=.65;
  for(let head=0;head<queue.length&&patch.cells.length<84;head++){
   const cell=queue[head],distance=Math.hypot(cell.x,cell.z)*spacing;if(distance>d.spread)continue;
   if(this.smokes.some(s=>s.densityAt(cell.position.x,cell.position.y+.2,cell.position.z)>.15))continue;
   patch.cells.push({position:cell.position.clone(),start:distance/d.spread*d.spreadTime,extinguished:false,seed:(patch.cells.length*1.618+patch.id*.73)%1});
   for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=cell.x+x,zz=cell.z+z,key=xx+','+zz;if(visited.has(key)||Math.hypot(xx,zz)*spacing>d.spread+.01)continue;visited.add(key);
    const desired=new Vector3(root.x+xx*spacing,cell.position.y+1.1,root.z+zz*spacing),ground=this.collision.ground(desired,2.1);if(!ground||ground.normal.y<.65||Math.abs(ground.position.y-cell.position.y)>.8)continue;
    const next=new Vector3().copy(ground.position).add(new Vector3(0,.035,0));if(!this.collision.visible(cell.position.clone().add(new Vector3(0,.18,0)),next.clone().add(new Vector3(0,.18,0))))continue;queue.push({x:xx,z:zz,position:next});
   }
  }
  if(patch.cells.length)this.fires.push(patch);return patch;
 }
 addDecoy(position:Vec3,owner:number,weapon:WeaponId){if(this.decoys.length>=10)this.decoys.shift();const decoy={id:++this.id,position:new Vector3().copy(position),owner,weapon,age:0,nextShot:.35,alive:true};this.decoys.push(decoy);return decoy;}
 update(dt:number,onDecoy:(decoy:Decoy,explode:boolean)=>void){
  let budget=384;const pending=this.smokes.filter(s=>!s.complete).length,share=Math.min(128,Math.floor(384/Math.max(1,pending)));for(const smoke of this.smokes){smoke.update(dt);if(budget>0&&!smoke.complete)budget-=smoke.bake(Math.min(share,budget));}
  this.smokes=this.smokes.filter(s=>s.alive);
  for(const fire of this.fires){fire.age+=dt;let extinguished=false;for(const cell of fire.cells){if(cell.extinguished)continue;if(this.smokes.some(s=>s.densityAt(cell.position.x,cell.position.y+.3,cell.position.z)>.12)){cell.extinguished=true;extinguished=true;}}if(extinguished&&!fire.sounded){fire.sounded=true;this.extinguish(fire.cells[0].position);}fire.alive=fire.age<fire.duration&&fire.cells.some(c=>!c.extinguished);}
  this.fires=this.fires.filter(f=>f.alive);
  for(const d of this.decoys){d.age+=dt;if(d.age>=15){d.alive=false;onDecoy(d,true);}else if(d.age>=d.nextShot){onDecoy(d,false);d.nextShot=d.age+(d.weapon==='awp'?1.3:d.weapon==='glock'?.55:.18)+(Math.sin(d.age*7)*.5+.5)*.55;}}
  this.decoys=this.decoys.filter(d=>d.alive);
 }
 burningAt(position:Vec3){return this.fires.find(f=>f.cells.some(c=>!c.extinguished&&f.age>=c.start&&Math.abs(position.y-c.position.y)<1.2&&Math.hypot(position.x-c.position.x,position.z-c.position.z)<.53));}
 fireDamage(patch:FirePatch,dt:number){return MathUtils.clamp(12+patch.age*18,12,40)*dt;}
 smokeBlocked(a:Vec3,b:Vec3){let depth=0;for(const s of this.smokes){depth+=s.opticalDepth(a,b);if(depth>2.2)return true;}return false;}
 bullet(a:Vec3,b:Vec3){for(const s of this.smokes)s.bullet(a,b);}
 blast(position:Vec3){for(const s of this.smokes)s.blast(position);}
 clear(){this.smokes.forEach(s=>s.alive=false);this.smokes=[];this.fires=[];this.decoys=[];}
 get stats(){return{smokes:this.smokes.length,firePatches:this.fires.length,fireCells:this.fires.reduce((n,f)=>n+f.cells.filter(c=>!c.extinguished).length,0),decoys:this.decoys.length,bakedCells:this.smokes.reduce((n,s)=>n+s.filled,0),bakeQueries:this.smokes.reduce((n,s)=>n+s.queries,0),holes:this.smokes.reduce((n,s)=>n+s.holes.length,0)};}
}
