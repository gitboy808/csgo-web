import{describe,it,expect}from'vitest';
import{MOVEMENT,moveSourceStyle,audibleFootstep}from'../src/game/movement';
const top=250*MOVEMENT.unit,dt=1/60;
function run(wish:{x:number;z:number},ticks:number,max=top,initial={x:0,z:0}){let v=initial;for(let i=0;i<ticks;i++)v=moveSourceStyle(v,wish,max,dt,true);return v;}
describe('Source-style movement contract',()=>{
 it('accelerates over time and clamps straight/diagonal movement to the same weapon speed',()=>{const first=run({x:1,z:0},1);expect(first.x).toBeGreaterThan(0);expect(first.x).toBeLessThan(top*.1);expect(run({x:1,z:0},60).x).toBeCloseTo(top);expect(Math.hypot(...Object.values(run({x:1,z:1},60)))).toBeCloseTo(top);});
 it('counter-strafes into the accurate range earlier than releasing, while a 90 degree turn retains inertia',()=>{const counter=run({x:-1,z:0},6,top,{x:top,z:0}),coast=run({x:0,z:0},6,top,{x:top,z:0}),turn=run({x:0,z:1},1,top,{x:top,z:0});expect(Math.abs(counter.x)).toBeLessThan(top*.34);expect(coast.x).toBeGreaterThan(top*.34);expect(turn.x).toBeGreaterThan(0);expect(turn.z).toBeGreaterThan(0);});
 it('keeps air momentum when releasing keys and caps extra speed along the air wish direction',()=>{const v={x:top,z:0};expect(moveSourceStyle(v,{x:0,z:0},top,dt,false)).toEqual(v);const air=moveSourceStyle(v,{x:0,z:1},top,dt,false);expect(air.x).toBe(top);expect(air.z).toBeLessThanOrEqual(MOVEMENT.airWishSpeed);});
 it('makes settled walking/crouching quiet but does not silence residual running velocity',()=>{expect(audibleFootstep(top,top,true)).toBe(true);expect(audibleFootstep(top*MOVEMENT.walk,top,true)).toBe(false);expect(audibleFootstep(top*MOVEMENT.duck,top,true)).toBe(false);expect(audibleFootstep(top,top,false)).toBe(false);});
});
