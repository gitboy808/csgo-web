import {beforeAll,afterEach,describe,it,expect} from 'vitest';
import * as THREE from 'three';import RAPIER from '@dimforge/rapier3d-compat';
import {Physics} from '../src/game/physics';
import {createProjectile,stepProjectile,throwLaunch,GrenadeThrowState,emptyGrenades,canPurchaseGrenade,flashExposure,heBlastDamage,type GrenadeCollision} from '../src/game/grenades';
import {adaptGrenadeMaterial} from '../src/world/source2-grenades';
import {SmokeField} from '../src/game/smoke-field';import {GrenadeHazards} from '../src/game/grenade-hazards';
const worlds:RAPIER.World[]=[];beforeAll(async()=>{await RAPIER.init();});afterEach(()=>{worlds.splice(0).forEach(w=>w.free());});
function fixture(wall=false){const p=new Physics();p.world=new RAPIER.World({x:0,y:0,z:0});worlds.push(p.world);p.world.createCollider(RAPIER.ColliderDesc.cuboid(50,.1,50).setTranslation(0,-.1,0).setCollisionGroups(0x0001ffff));if(wall)p.world.createCollider(RAPIER.ColliderDesc.cuboid(.02,20,20).setTranslation(0,0,0).setCollisionGroups(0x0001ffff));p.world.step();return p.grenadeCollision(()=>[]);}
const input={eye:new THREE.Vector3(0,1.6256,0),yaw:0,pitch:0,velocity:new THREE.Vector3(),strength:1,kind:'he' as const,owner:0};
function advance(g:ReturnType<typeof createProjectile>,collision:GrenadeCollision,seconds:number){for(let i=0;i<seconds*60&&g.alive;i++)stepProjectile(g,1/60,collision);return g;}
describe('grenade input and launch',()=>{
 it('supports high, medium and underhand release with inherited run/jump velocity',()=>{
  const high=throwLaunch(input),mid=throwLaunch({...input,strength:.5}),low=throwLaunch({...input,strength:0});expect(high.velocity.length()).toBeCloseTo(17.145,3);expect(mid.velocity.length()).toBeGreaterThan(low.velocity.length());expect(mid.velocity.length()).toBeLessThan(high.velocity.length());expect(low.position.y).toBeLessThan(high.position.y);
  const moving=throwLaunch({...input,velocity:new THREE.Vector3(4,7,0)});expect(moving.velocity.x-high.velocity.x).toBeCloseTo(5);expect(moving.velocity.y-high.velocity.y).toBeCloseTo(8.75);
 });
 it('waits for pin pull, releases once and never cooks a held grenade',()=>{
  const state=new GrenadeThrowState();expect(state.update(1/60,true,false,.967).action).toBe('pullpin');let heldReleases=0;for(let i=0;i<1200;i++)if(state.update(1/60,true,false,.967).release!==undefined)heldReleases++;expect(heldReleases).toBe(0);expect(state.phase).toBe('holding');expect(state.update(1/60,false,false,.967).action).toBe('throwHigh');let releases=0;for(let i=0;i<60;i++)if(state.update(1/60,false,false,.967).release!==undefined)releases++;expect(releases).toBe(1);expect(state.phase).toBe('idle');
 });
 it('retains the round purchase limit after dropping equipment',()=>{const used=emptyGrenades();used.smoke=1;expect(canPurchaseGrenade('smoke','CT',emptyGrenades(),16000,used)).toBe(false);expect(canPurchaseGrenade('flash','CT',emptyGrenades(),16000,used)).toBe(true);used.he=1;used.flash=2;expect(canPurchaseGrenade('decoy','CT',emptyGrenades(),16000,used)).toBe(false);});
 it('enforces 4 total, 2 flashes and mutually exclusive fire equipment',()=>{
  const inventory=emptyGrenades();inventory.flash=2;inventory.he=1;inventory.smoke=1;expect(canPurchaseGrenade('decoy','CT',inventory,16000)).toBe(false);expect(canPurchaseGrenade('flash','CT',inventory,16000)).toBe(false);inventory.smoke=0;inventory.molotov=1;expect(canPurchaseGrenade('incendiary','CT',inventory,16000)).toBe(false);expect(canPurchaseGrenade('molotov','CT',emptyGrenades(),16000)).toBe(false);expect(canPurchaseGrenade('incendiary','CT',emptyGrenades(),500)).toBe(true);
 });
});
describe('continuous projectile collision and detonation',()=>{
 it('does not tunnel through a thin wall at high speed',()=>{
  const collision=fixture(true),g=createProjectile(1,{...input,eye:new THREE.Vector3(-1,1,0),yaw:-Math.PI/2},collision);g.velocity.set(80,0,0);
  for(let i=0;i<15;i++){stepProjectile(g,1/60,collision);expect(g.position.x).toBeLessThan(0);}expect(g.bounces).toBeGreaterThan(0);expect(g.velocity.x).toBeLessThan(0);
 });
 it('bounces off the floor and gives smoke a rest-triggered fuse instead of popping in flight',()=>{
  const collision=fixture(),he=advance(createProjectile(1,input,collision),collision,1.6),smoke=createProjectile(2,{...input,kind:'smoke',pitch:.7},collision);
  expect(he.detonated).toBe(true);expect(he.age).toBeCloseTo(1.5,1);expect(he.bounces).toBeGreaterThan(0);advance(smoke,collision,1.6);expect(smoke.alive).toBe(true);advance(smoke,collision,8.5);expect(smoke.detonated).toBe(true);expect(smoke.position.y).toBeGreaterThan(0);expect(smoke.position.y).toBeLessThan(.2);
 });
 it('does not trigger smoke at the nearly stationary apex of a vertical throw',()=>{const air:GrenadeCollision={sweep:()=>null,visible:()=>true,ground:()=>null},g=createProjectile(1,{...input,kind:'smoke',pitch:Math.PI/2},air);advance(g,air,2.13);expect(g.alive).toBe(true);expect(g.floor).toBe(false);});
 it('ignites fire on walkable ground, not on a vertical wall',()=>{
  const collision=fixture(true),g=createProjectile(1,{...input,kind:'molotov',eye:new THREE.Vector3(-1,1.6,0),yaw:-Math.PI/2},collision);g.velocity.set(15,0,0);advance(g,collision,.12);expect(g.bounces).toBeGreaterThan(0);expect(g.alive).toBe(true);advance(g,collision,2);expect(g.detonated).toBe(true);expect(g.position.y).toBeLessThan(.2);
 });
});
describe('blast and flash exposure',()=>{
 it('uses armor and cover for HE, and facing and occlusion for flash',()=>{expect(heBlastDamage(1,100,1).health).toBeLessThan(heBlastDamage(1,0,1).health);expect(heBlastDamage(1,0,0).health).toBe(0);expect(heBlastDamage(10,0,1).health).toBe(0);expect(flashExposure(3,1,true).hold).toBeGreaterThan(flashExposure(3,-1,true).hold);expect(flashExposure(3,1,false).alpha).toBe(0);expect(flashExposure(10,1,true).hold).toBeLessThan(flashExposure(3,1,true).hold);});
});
describe('one bounded smoke field for renderer and bots',()=>{
 it('conforms to walls, opens a bullet channel, then closes that same channel',()=>{
  const smoke=new SmokeField(1,new THREE.Vector3(-1,0,0),fixture(true));smoke.age=2;smoke.bake(100000);expect(smoke.complete).toBe(true);expect(smoke.densityAt(1,1,0)).toBe(0);expect(smoke.densityAt(-1,1,0)).toBeGreaterThan(.3);
  const a=new THREE.Vector3(-1,1,-6),b=new THREE.Vector3(-1,1,6);expect(smoke.opticalDepth(a,b)).toBeGreaterThan(2.2);smoke.bullet(a,b);expect(smoke.opticalDepth(a,b)).toBeLessThan(.01);smoke.update(.5);expect(smoke.opticalDepth(a,b)).toBeGreaterThan(2.2);
 });
 it('does not let an HE open smoke through a solid wall',()=>{
  const smoke=new SmokeField(1,new THREE.Vector3(-1,0,0),fixture(true));smoke.age=2;smoke.bake(100000);smoke.blast(new THREE.Vector3(1,.3,0));expect(smoke.holes.length).toBe(0);smoke.blast(new THREE.Vector3(-1,.3,0));expect(smoke.holes.length).toBe(1);expect(Math.exp(-smoke.opticalDepth(new THREE.Vector3(-1,1,-6),new THREE.Vector3(-1,1,6)))).toBeGreaterThan(.8);smoke.update(2.1);expect(smoke.opticalDepth(new THREE.Vector3(-1,1,-6),new THREE.Vector3(-1,1,6))).toBeGreaterThan(2.2);
 });
 it('limits baking queries per step and extinguishes actual fire cells',()=>{
  const collision=fixture(),smoke=new SmokeField(1,new THREE.Vector3(),collision);expect(smoke.bake(128)).toBeLessThanOrEqual(128);
  let extinguished=0;const hazards=new GrenadeHazards(collision,()=>{},()=>extinguished++);const fire=hazards.addFire(new THREE.Vector3(0,.035,0),'molotov',0);fire.age=2;expect(hazards.fires.length).toBe(1);const cloud=hazards.addSmoke(new THREE.Vector3(),'CT');cloud.age=2;cloud.bake(100000);hazards.update(1/60,()=>{});expect(hazards.fires.length).toBe(0);expect(extinguished).toBe(1);hazards.clear();expect(hazards.smokes.length).toBe(0);
 });
});
it('does not apply the exporter’s unauthored black ORM to the native molotov liquid',()=>{const material=new THREE.MeshStandardMaterial({metalness:1,aoMap:new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1)});material.userData.vmat={ShaderName:'csgo_simple_liquid.vfx',TextureParams:{g_tColorA:'original-color.vtex'},FloatParams:{g_flLiquidRoughness:.195}};const adapted=adaptGrenadeMaterial(material)as THREE.MeshStandardMaterial;expect(adapted.aoMap).toBeNull();expect(adapted.metalness).toBe(0);expect(adapted.transparent).toBe(true);expect(adapted.depthWrite).toBe(false);});
