import{afterEach,beforeAll,describe,expect,it,vi}from'vitest';
import RAPIER from'@dimforge/rapier3d-compat';
import{Vector3}from'three';
import{Game}from'../src/game/game';
import{Physics}from'../src/game/physics';
import{GameAudio}from'../src/game/audio';

beforeAll(async()=>{await RAPIER.init();});
afterEach(()=>{vi.unstubAllGlobals();});
describe('actual player movement / audio regression',()=>{
 it('removes blocked horizontal velocity instead of keeping a running speed against a wall',()=>{
  const p=new Physics();p.world=new RAPIER.World({x:0,y:0,z:0});p.controller=p.world.createCharacterController(.015);p.controller.enableSnapToGround(.35);
  p.world.createCollider(RAPIER.ColliderDesc.cuboid(20,.1,20).setTranslation(0,-.1,0).setCollisionGroups(0x0001ffff));
  p.world.createCollider(RAPIER.ColliderDesc.cuboid(.1,10,20).setTranslation(1.5,0,0).setCollisionGroups(0x0001ffff));
  const{body,collider}=p.character({x:0,y:.025,z:0});p.world.step();
  const pawn={id:0,body,collider,velocity:new Vector3(6.35,0,0),position:new Vector3(),grounded:true,crouch:false};
  const game=Object.assign(Object.create(Game.prototype),{physics:p,audio:{step:vi.fn()},time:1});
  for(let i=0;i<30;i++){pawn.velocity.x=6.35;game.move(pawn,1/60);p.world.step();}
  expect(body.translation().x).toBeLessThan(1.1);expect(Math.abs(pawn.velocity.x)).toBeLessThan(.05);p.world.free();
 });
 it('plays the concrete footstep selected by the material mapping',async()=>{
  const buffers:any[]=[];const native={native:true,length:4800,numberOfChannels:1};
  const node=()=>({gain:{value:1},frequency:{value:1},pan:{value:0},playbackRate:{value:1},connect(n:unknown){return n;},disconnect(){},start(){buffers.push(this.buffer);},buffer:null as unknown,onended:null});
  class Context{state='running';currentTime=1;sampleRate=48000;destination=node();createGain=node;createBiquadFilter=node;createStereoPanner=node;createBufferSource=node;createBuffer=(_n:number,n:number)=>({synthetic:true,getChannelData:()=>new Float32Array(n)});async decodeAudioData(){return native;}}
  vi.stubGlobal('AudioContext',Context);vi.stubGlobal('OfflineAudioContext',Context);
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url.endsWith('surfaces.json')?{CT:{concrete:{step:'ct_concrete.stepleft'}},T:{}}:{'ct_concrete.stepleft':{files:['concrete.wav'],volume:.9,pitch:1,pitchRandom:[0,0],cooldown:.15,limit:2,children:[]}},arrayBuffer:async()=>new ArrayBuffer(4)})));
  const audio=new GameAudio();await audio.start();await audio.footsteps.prepare();
  audio.step(undefined,false,'concrete');expect(buffers[0]).toBe(native);
 });
});
