import{describe,it,expect,vi}from'vitest';
import{Group,Vector3}from'three';
import{Game}from'../src/game/game';
import{newMatch}from'../src/game/rules';
import{createWeapon}from'../src/game/weapons';
import{emptyGrenades}from'../src/game/grenades';
function pawn(id=0){return{id,team:0,name:'P'+id,alive:true,health:100,armor:0,helmet:false,kit:false,money:800,kills:0,deaths:0,slot:'knife',inventory:[createWeapon('knife')],position:new Vector3(),velocity:new Vector3(),grenades:emptyGrenades(),collider:{setEnabled:vi.fn()}};}
describe('ground equipment regressions',()=>{
 it('automatically takes a nearby gun into an empty slot without pressing E',()=>{
  const p=pawn(),w=createWeapon('usp');w.ammo=5;const match=newMatch();match.phase='live';
  const game:any=Object.assign(Object.create(Game.prototype),{actors:[p],match,time:1,input:{down:()=>false,pressed:new Set()},drops:[{weapon:w,position:new Vector3(.3,.1,0),mesh:new Group(),team:0}],grenadeDrops:[],physics:{canSee:()=>true},scene:{remove:vi.fn()},ui:{toast:vi.fn()},setSlot:vi.fn()});
  game.interact(1/60);expect(p.inventory.some(w=>w.id==='usp'&&w.ammo===5)).toBe(true);
 });
 it('drops the primary gun on death even while the victim is holding a knife',()=>{
  const local=pawn(),dead=pawn(1);dead.inventory.push(createWeapon('ak47'));const spawnDrop=vi.fn();
  const game:any=Object.assign(Object.create(Game.prototype),{actors:[local,dead],match:newMatch(),time:1,training:false,spawnDrop,ui:{kill:vi.fn()},spectator:0});
  game.damage(dead,100,null,false,'TEST');expect(dead.alive).toBe(false);expect(spawnDrop.mock.calls.some(c=>c[1].id==='ak47')).toBe(true);
 });
 it('does not pick through walls or immediately pick up the player’s own throw',()=>{
  const p=pawn(),match=newMatch(),drop={weapon:createWeapon('usp'),position:new Vector3(.3,.1,0),mesh:new Group(),team:0,owner:0,pickupAfter:2};match.phase='live';let clear=true;
  const game:any=Object.assign(Object.create(Game.prototype),{actors:[p],match,time:1,input:{down:()=>false,pressed:new Set()},drops:[drop],grenadeDrops:[],physics:{canSee:()=>clear},scene:{remove:vi.fn()},ui:{toast:vi.fn()},setSlot:vi.fn()});
  game.interact(1/60);expect(p.inventory).toHaveLength(1);game.time=3;clear=false;game.interact(1/60);expect(p.inventory).toHaveLength(1);game.time=4;clear=true;game.interact(1/60);expect(p.inventory.some(w=>w.id==='usp')).toBe(true);
 });
 it('keeps an occupied slot until E explicitly swaps it, without refilling either weapon',()=>{
  const p=pawn(),m4=createWeapon('m4a1'),ak=createWeapon('ak47'),match=newMatch();m4.ammo=4;ak.ammo=7;p.inventory.push(m4);match.phase='live';let pressed=false;const spawnDrop=vi.fn();
  const game:any=Object.assign(Object.create(Game.prototype),{actors:[p],match,time:1,input:{down:()=>pressed,pressed:new Set()},drops:[{weapon:ak,position:new Vector3(.3,.1,0),mesh:new Group(),team:0}],grenadeDrops:[],physics:{canSee:()=>true},scene:{remove:vi.fn()},ui:{toast:vi.fn()},setSlot:vi.fn(),spawnDrop});
  game.interact(1/60);expect(p.inventory).toContain(m4);pressed=true;game.input.pressed.add('KeyE');game.time=2;game.interact(1/60);expect(p.inventory).not.toContain(m4);expect(p.inventory.find(w=>w.id==='ak47')?.ammo).toBe(7);expect(spawnDrop.mock.calls[0][1].ammo).toBe(4);
 });
});
