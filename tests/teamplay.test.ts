import{beforeAll,describe,it,expect,vi}from'vitest';
import RAPIER from'@dimforge/rapier3d-compat';
import{Group,Vector3}from'three';
import{Physics}from'../src/game/physics';
import{Game}from'../src/game/game';
import{newMatch}from'../src/game/rules';
import{createWeapon}from'../src/game/weapons';
import{newHandling}from'../src/game/weapon-handling';
import{canTakeOver,teamDamageScale}from'../src/game/teamplay';
beforeAll(async()=>{await RAPIER.init();});
function collisionScene(){const p=new Physics();p.world=new RAPIER.World({x:0,y:0,z:0});p.controller=p.world.createCharacterController(.015);p.controller.enableSnapToGround(.35);p.world.createCollider(RAPIER.ColliderDesc.cuboid(20,.1,20).setTranslation(0,-.1,0).setCollisionGroups(0x0001ffff));return p;}
describe('solid living players',()=>{
 it('stops at an ally and permits passage after that ally dies',()=>{const p=collisionScene(),a=p.character({x:0,y:.03,z:0}),b=p.character({x:2,y:.03,z:0});p.world.step();for(let i=0;i<60;i++){p.move(a.body,a.collider,{x:.1,y:-.01,z:0});p.world.step();}expect(a.body.translation().x).toBeLessThan(1.2);b.collider.setEnabled(false);for(let i=0;i<30;i++){p.move(a.body,a.collider,{x:.1,y:-.01,z:0});p.world.step();}expect(a.body.translation().x).toBeGreaterThan(3);p.world.free();});
 it('prevents two moving players from crossing through each other head-on',()=>{const p=collisionScene(),a=p.character({x:-1.5,y:.03,z:0}),b=p.character({x:1.5,y:.03,z:0});p.world.step();for(let i=0;i<90;i++){p.move(a.body,a.collider,{x:.1,y:-.01,z:0});p.move(b.body,b.collider,{x:-.1,y:-.01,z:0});p.world.step();expect(Math.hypot(b.body.translation().x-a.body.translation().x,b.body.translation().z-a.body.translation().z)).toBeGreaterThan(.8);}p.world.free();});
});
function actor(id:number,team:0|1,z:number){return{id,team,name:'P'+id,alive:true,health:100,armor:0,helmet:false,money:800,kills:0,deaths:0,position:new Vector3(0,0,z),velocity:new Vector3(),slot:'glock',inventory:[createWeapon('glock')],yaw:0,pitch:0,crouch:false,grounded:true,handling:newHandling(),shotCount:0,nextShot:0,reloadUntil:0,model:{root:new Group()},grenades:{},collider:{setEnabled:vi.fn()}};}
describe('team fire and possession',()=>{
 it('hits the nearer teammate instead of passing through to an enemy',()=>{
  const actors=[actor(0,0,0),actor(1,0,-3),actor(5,1,-6)],game:any=Object.assign(Object.create(Game.prototype),{actors,match:newMatch(),time:1,settings:{difficulty:'normal'},physics:{ray:()=>null},hitboxes:{candidate:()=>true,raycast:(_r:unknown,_m:unknown,_s:unknown,p:Vector3)=>({group:'chest',distance:-p.z})},effects:{impact:vi.fn(),tracer:vi.fn(),shell:vi.fn()},hazards:{bullet:vi.fn()},audio:{shot:vi.fn(),hit:vi.fn(),hits:{ready:true},position:new Vector3()},ui:{hit:vi.fn(),hurt:vi.fn()},flashLight:{},say:vi.fn()});
  // Raycaster respects nearest; this lightweight fixture must do so too.
  game.hitboxes.raycast=(_r:unknown,_m:unknown,_s:unknown,p:Vector3,max:number)=>-p.z<max?{group:'chest',distance:-p.z}:null;
  game.shoot(actors[0]);expect(actors[1].health).toBe(90);expect(actors[2].health).toBe(100);
  expect(teamDamageScale(actors[0],actors[1],'bullet')).toBe(.33);expect(teamDamageScale(actors[0],actors[1],'grenade')).toBe(.85);expect(teamDamageScale(actors[0],actors[0],'grenade')).toBe(1);
 });
 it('takes the living bot in place without reviving the original player or replacing equipment/C4 identity',()=>{
  const actors=[actor(0,0,0),actor(1,0,-3),actor(2,0,-5)],match=newMatch();match.phase='planted';match.bomb.carrier=1;actors[0].alive=false;actors[1].health=47;actors[1].inventory[0].ammo=7;actors[1].reloadUntil=2.4;const gear=actors[1].inventory;
  const game:any=Object.assign(Object.create(Game.prototype),{actors,match,time:1,training:false,interactionActor:2,cancelThrow:vi.fn(),resetInteraction:vi.fn(),input:{reset:vi.fn()},ui:{radioMenu:vi.fn(),toast:vi.fn()},grenadeProps:new Map(),selectView:vi.fn(),currentView:{animation:{play:vi.fn()}},audio:{hits:{clear:vi.fn()},footsteps:{clear:vi.fn()}},media:{music:vi.fn()},updateHUD:vi.fn(),wakeRendering:vi.fn()});
  expect(game.takeOver(1)).toBe(true);expect(game.resetInteraction).not.toHaveBeenCalled();expect(game.player).toBe(actors[1]);expect(actors[0].alive).toBe(false);expect(actors[1].inventory).toBe(gear);expect(actors[1].health).toBe(47);expect(gear[0].ammo).toBe(7);expect(actors[1].reloadUntil).toBe(2.4);expect(match.bomb.carrier).toBe(1);expect(game.takeOver(2)).toBe(false);
  actors[1].alive=false;expect(game.takeOver(2)).toBe(true);expect(game.player).toBe(actors[2]);
 });
 it('rejects a dead/enemy target and takeover after the round has ended',()=>{const match=newMatch();match.phase='live';const self={alive:false,team:0 as const},ally={id:1,team:0 as const,alive:true};expect(canTakeOver(match,self,ally)).toBe(true);expect(canTakeOver(match,self,{...ally,alive:false})).toBe(false);expect(canTakeOver(match,self,{...ally,team:1})).toBe(false);match.phase='end';expect(canTakeOver(match,self,ally)).toBe(false);});
});
