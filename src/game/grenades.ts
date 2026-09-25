import {Vector3,MathUtils} from 'three';
import type {GrenadeId,Side,Vec3} from './types';
export const GRENADE_IDS:GrenadeId[]=['he','flash','smoke','molotov','incendiary','decoy'];
export interface GrenadeDefinition {name:string;price:number;limit:number;side?:Side;throwVelocity:number;maxSpeed:number;fuse:number;radius:number;damage:number;armorRatio:number;burnTime:number;spread:number;spreadTime:number}
const base={throwVelocity:750*.0254,maxSpeed:245*.0254,radius:.0508,armorRatio:1.2,burnTime:0,spread:0,spreadTime:1};
export const GRENADES:Record<GrenadeId,GrenadeDefinition>={
 he:{...base,name:'高爆手雷',price:300,limit:1,fuse:1.5,damage:99},
 flash:{...base,name:'闪光弹',price:200,limit:2,fuse:1.5,damage:0},
 smoke:{...base,name:'烟雾弹',price:300,limit:1,fuse:1.5,damage:0},
 molotov:{...base,name:'燃烧瓶',price:400,limit:1,side:'T',fuse:3.5,damage:0,burnTime:7,spread:3.3,spreadTime:1.25},
 incendiary:{...base,name:'燃烧弹',price:500,limit:1,side:'CT',fuse:3.5,damage:0,burnTime:5.5,spread:2.6,spreadTime:.7},
 decoy:{...base,name:'诱饵弹',price:50,limit:1,fuse:2,damage:5},
};
const GRENADE_GRAVITY=800*.4*.0254;
export const SMOKE_DURATION=18;
export const MAX_PROJECTILES=32;
export const emptyGrenades=():Record<GrenadeId,number>=>({he:0,flash:0,smoke:0,molotov:0,incendiary:0,decoy:0});
export function grenadeCount(inventory:Record<GrenadeId,number>){return GRENADE_IDS.reduce((n,id)=>n+(inventory[id]||0),0);}
export function canCarryGrenade(kind:GrenadeId,inventory:Record<GrenadeId,number>){return grenadeCount(inventory)<4&&(inventory[kind]||0)<GRENADES[kind].limit&&(!['molotov','incendiary'].includes(kind)||!(inventory.molotov||inventory.incendiary));}
export function canPurchaseGrenade(kind:GrenadeId,side:Side,inventory:Record<GrenadeId,number>,money:number,used=inventory){const d=GRENADES[kind];return (!d.side||d.side===side)&&money>=d.price&&canCarryGrenade(kind,inventory)&&grenadeCount(used)<4&&(used[kind]||0)<d.limit&&(!['molotov','incendiary'].includes(kind)||!(used.molotov||used.incendiary));}
export interface SweepHit {fraction:number;normal:Vec3;surface:string;actor?:number}
export interface GrenadeCollision {
 sweep(origin:Vec3,delta:Vec3,radius:number,ignoreOwner?:number):SweepHit|null;
 visible(a:Vec3,b:Vec3):boolean;
 ground(origin:Vec3,depth:number):{position:Vec3;normal:Vec3}|null;
}
export interface ThrowInput {eye:Vec3;yaw:number;pitch:number;velocity:Vec3;strength:number;kind:GrenadeId;owner:number}
export function throwLaunch(input:ThrowInput,collision?:GrenadeCollision){
 const strength=MathUtils.clamp(input.strength,0,1),degrees=MathUtils.radToDeg(input.pitch),pitch=MathUtils.degToRad(degrees+10*(90-Math.abs(degrees))/90);
 const forward=new Vector3(-Math.sin(input.yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(input.yaw)*Math.cos(pitch));
 const origin=new Vector3().copy(input.eye);origin.y+=(strength*12-12)*.0254;
 const offset=forward.clone().multiplyScalar(22*.0254),hit=collision?.sweep(origin,offset,GRENADES[input.kind].radius,input.owner);
 const distance=hit?Math.max(0,offset.length()*hit.fraction-6*.0254):16*.0254;
 origin.addScaledVector(forward,distance);
 const velocity=forward.multiplyScalar(GRENADES[input.kind].throwVelocity*.9*(.3+.7*strength)).addScaledVector(input.velocity,1.25);
 return {position:origin,velocity,strength};
}
export interface GrenadeProjectile {id:number;kind:GrenadeId;owner:number;position:Vector3;velocity:Vector3;age:number;resting:boolean;bounces:number;lastBounce:number;alive:boolean;detonated:boolean;floor:boolean;rotation:number;strength:number}
export function createProjectile(id:number,input:ThrowInput,collision?:GrenadeCollision):GrenadeProjectile{const launch=throwLaunch(input,collision);return{id,kind:input.kind,owner:input.owner,...launch,age:0,resting:false,bounces:0,lastBounce:-1,alive:true,detonated:false,floor:false,rotation:0};}
export type GrenadeStepEvent={type:'bounce';projectile:GrenadeProjectile;speed:number;surface:string;actor?:number}|{type:'detonate';projectile:GrenadeProjectile;airburst:boolean};
const delta=new Vector3(),normal=new Vector3();
/** Swept hull integration, shared by live grenades and the practice trajectory. */
export function stepProjectile(g:GrenadeProjectile,dt:number,collision:GrenadeCollision,emit?:(event:GrenadeStepEvent)=>void){
 if(!g.alive)return;g.age+=dt;const definition=GRENADES[g.kind],fire=g.kind==='molotov'||g.kind==='incendiary';
 if(!g.resting){
  g.velocity.y-=GRENADE_GRAVITY*dt*.5;let remaining=dt;
  for(let contact=0;contact<4&&remaining>.0001;contact++){
   delta.copy(g.velocity).multiplyScalar(remaining);const hit=collision.sweep(g.position,delta,definition.radius,g.age<.25?g.owner:undefined);
   if(!hit){g.position.add(delta);break;}
   g.position.addScaledVector(delta,Math.max(0,hit.fraction));normal.copy(hit.normal).normalize();g.position.addScaledVector(normal,.002);
   const speed=g.velocity.length();g.bounces++;g.floor=normal.y>.7;
   if(g.age-g.lastBounce>.06&&speed>.8){g.lastBounce=g.age;emit?.({type:'bounce',projectile:g,speed,surface:hit.surface,actor:hit.actor});}
   if(fire&&g.floor){g.alive=false;g.detonated=true;emit?.({type:'detonate',projectile:g,airburst:false});return;}
   const incoming=g.velocity.dot(normal);if(incoming<0)g.velocity.addScaledVector(normal,-2*incoming).multiplyScalar(hit.actor===undefined?.45:.3);
   if(g.floor){const friction=Math.max(0,1-dt*7);g.velocity.x*=friction;g.velocity.z*=friction;if(g.velocity.lengthSq()<.48*.48){g.velocity.set(0,0,0);g.resting=true;break;}}
   remaining*=Math.max(0,1-hit.fraction);if(hit.fraction<.0001)remaining*=.5;
  }
  if(!g.resting)g.velocity.y-=GRENADE_GRAVITY*dt*.5;g.rotation+=g.velocity.length()*dt*3;
 }
 const timed=g.kind==='he'||g.kind==='flash'||fire;
 if(g.age+1e-6>=definition.fuse&&(timed||g.resting||g.floor&&g.velocity.lengthSq()<.01)||g.age>10){
  let airburst=false;if(fire){const ground=collision.ground(g.position,2.4);if(ground&&ground.normal.y>.7)g.position.copy(ground.position).add(new Vector3(0,.04,0));else airburst=true;}
  g.alive=false;g.detonated=true;emit?.({type:'detonate',projectile:g,airburst});
 }
}
export function heBlastDamage(distance:number,armor:number,exposure:number){
 if(distance>350*.0254||exposure<=0)return{health:0,armor:0};
 const raw=GRENADES.he.damage*Math.exp(-Math.pow(distance/(140*.0254),2)) *MathUtils.clamp(exposure,0,1);
 if(!armor)return{health:Math.ceil(raw),armor:0};
 const health=raw*GRENADES.he.armorRatio*.5,absorb=(raw-health)*.5;
 return absorb>armor?{health:Math.ceil(raw-armor*2),armor}:{health:Math.ceil(health),armor:Math.ceil(absorb)};
}
export interface FlashExposure {hold:number;fade:number;alpha:number;ring:number}
export function flashExposure(distance:number,facing:number,visible:boolean):FlashExposure{
 if(!visible||distance>45)return{hold:0,fade:0,alpha:0,ring:0};
 const attenuation=MathUtils.clamp(1-distance/45,0,1),view=MathUtils.smoothstep(facing,-.25,.85),strength=attenuation*(.15+.85*view);
 return{hold:2.1*strength,fade:.35+3*strength,alpha:Math.min(1,.45+strength),ring:Math.min(5,.8+4.2*strength)};
}
export type ThrowPhase='idle'|'pin'|'holding'|'throwing';
/** No grenade cooking: the fuse starts only when the projectile leaves the hand. */
export class GrenadeThrowState {
 phase:ThrowPhase='idle';strength=1;private elapsed=0;private released=false;private spawned=false;
 reset(){this.phase='idle';this.elapsed=0;this.released=this.spawned=false;}
 update(dt:number,left:boolean,right:boolean,pinDuration:number):{action?:'pullpin'|'holdHigh'|'holdMid'|'holdLow'|'throwHigh'|'throwLow';release?:number;finished?:boolean}{
  if(this.phase==='idle'){if(!left&&!right)return{};this.phase='pin';this.elapsed=0;this.released=false;this.strength=left?(right?.5:1):0;return{action:'pullpin'};}
  this.elapsed+=dt;
  if(this.phase==='pin'||this.phase==='holding'){
   if(left||right){this.strength+=( (left?(right?.5:1):0)-this.strength)*Math.min(1,dt*12);}else this.released=true;
   if(this.phase==='pin'&&this.elapsed<pinDuration)return{};
   if(this.released){this.phase='throwing';this.elapsed=0;this.spawned=false;return{action:this.strength<.4?'throwLow':'throwHigh'};}
   this.phase='holding';return{action:this.strength>.75?'holdHigh':this.strength<.25?'holdLow':'holdMid'};
  }
  const result:{release?:number;finished?:boolean}={};if(!this.spawned&&this.elapsed>=(this.strength<.4?.15:.12)){this.spawned=true;result.release=this.strength;}
  if(this.elapsed>=(this.strength<.4?.5:.767)){result.finished=true;this.reset();}return result;
 }
}
