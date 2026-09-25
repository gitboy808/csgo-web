import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {Game} from '../src/game/game';
import {RenderBudget} from '../src/game/render-budget';

// Drive the production frame entry point without WebGL or asset loading. The
// spies count actual submitted renders; game logic/audio remain separate seams.
function harness(hidden=false){
  vi.stubGlobal('document',{hidden});
  const game=Object.create(Game.prototype) as any;
  const render=vi.fn(),tick=vi.fn(),animate=vi.fn();
  const actor={id:1,alive:false,position:new THREE.Vector3(),velocity:new THREE.Vector3(),yaw:0,pitch:0,slot:'usp',lastFire:-100,lastDamage:-100,reloadUntil:0,kit:false,model:{root:new THREE.Group(),animation:{update:animate},weapon:{root:new THREE.Group(),muzzle:new THREE.Group()}}};
  Object.assign(game,{active:true,paused:true,settings:{quality:'high',frameLimit:60,dynamicResolution:false},match:{phase:'live'},last:0,frames:0,fpsTime:0,fps:0,time:0,menuTime:0,accumulator:0,hudAt:0,scopeLevel:0,actors:[{...actor,id:0,model:{...actor.model,root:new THREE.Group()}},actor],training:false,inspecting:false,musicAudition:false,interactionActor:null,performanceSamples:[],scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),renderer:{render,clear:vi.fn(),clearDepth:vi.fn(),shadowMap:{needsUpdate:false},info:{reset:vi.fn()}},level:{update:vi.fn(),render},visibility:{begin:vi.fn(),test:()=>({visible:true,shadow:true})},worldResolution:{render:(_renderer:unknown,draw:()=>void)=>draw()},media:{setPaused:vi.fn(),update:vi.fn()},effects:{update:vi.fn()},updateCamera:vi.fn(),updateHUD:vi.fn(),tick});
  return {game,render,tick,animate};
}
afterEach(()=>vi.unstubAllGlobals());

describe('rendering work while idle',()=>{
  it('does not miss a display refresh because of sub-millisecond callback jitter',()=>{
    const budget=new RenderBudget(),times:number[]=[];
    for(let i=0;i<360;i++){const time=i*1000/120+Math.sin(i*.71)*.45;if(budget.take(time,'play',60)!==null)times.push(time);}
    const gaps=times.slice(1).map((time,i)=>time-times[i]);expect(Math.max(...gaps)).toBeLessThan(18);
  });
  it('keeps a paused match on one frame instead of continuously rendering shadows and actors',()=>{
    const {game,render,animate}=harness();
    for(let i=0;i<=120;i++)game.frame(i*1000/120);
    expect(render.mock.calls.length).toBe(1);
    expect(animate.mock.calls.length).toBe(1);
  });
  it('submits no scene or shadow work while the document is hidden',()=>{
    const {game,render}=harness(true);
    for(let i=0;i<20;i++)game.frame(i*1000);
    expect(render.mock.calls.length).toBe(0);
  });
  it('caps GPU submissions at 60 FPS while keeping the fixed 60 Hz simulation',()=>{
    const {game,render,tick}=harness();game.paused=false;
    for(let i=0;i<=120;i++)game.frame(i*1000/120);
    expect(render.mock.calls.length).toBeLessThanOrEqual(62);
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(59);
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(59);
    expect(tick.mock.calls.length).toBeLessThanOrEqual(61);
  });
});
