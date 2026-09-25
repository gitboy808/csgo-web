import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {newHandling,applyShotRecoil,advanceHandling,weaponInaccuracy,spreadOffset,nextAttackTime} from '../src/game/weapon-handling';
import {resolveDamage} from '../src/game/weapons';
import type {NativeWeaponTuning} from '../src/game/types';

const present=existsSync('public/assets/source2/weapons/data.json');
describe.skipIf(!present)('handling with the original CS2 weapon parameters',()=>{
  const weapons=present?JSON.parse(readFileSync('public/assets/source2/weapons/data.json','utf8')).weapons:{};
  const ak=weapons.ak47?.tuning as NativeWeaponTuning;
  it('penalizes running and jumping, and restores precision after stopping',()=>{
    const state=newHandling(),stand=weaponInaccuracy(ak,state,0,false,true,false);
    expect(weaponInaccuracy(ak,state,ak.maxSpeed,false,true,false)).toBeGreaterThan(stand*10);
    expect(weaponInaccuracy(ak,state,0,false,false,false)).toBeGreaterThan(stand*10);
    expect(weaponInaccuracy(ak,state,0,true,true,false)).toBeLessThan(stand);
    applyShotRecoil(state,ak,0);expect(state.penalty).toBeGreaterThan(0);
    for(let i=1;i<=60;i++)advanceHandling(state,ak,1/60,i/60,false);
    expect(weaponInaccuracy(ak,state,0,false,true,false)).toBeCloseTo(stand,4);
  });
  it('returns recoil to rest without permanently moving the mouse aim',()=>{
    const state=newHandling();applyShotRecoil(state,ak,0);
    for(let i=1;i<=6;i++)advanceHandling(state,ak,1/60,i/60,false);
    expect(state.pitch).toBeGreaterThan(.005);
    for(let i=7;i<=75;i++)advanceHandling(state,ak,1/60,i/60,false);
    expect(Math.abs(state.pitch)).toBeLessThan(.0001);expect(Math.abs(state.yaw)).toBeLessThan(.0001);
  });
  it('uses a repeatable recoil sequence and resets it after cooldown',()=>{
    const a=newHandling(),b=newHandling();applyShotRecoil(a,ak,0);applyShotRecoil(b,ak,0);expect(a.pitchVelocity).toBe(b.pitchVelocity);expect(a.yawVelocity).toBe(b.yawVelocity);
    for(let i=1;i<=120;i++)advanceHandling(a,ak,1/60,i/60,false);
    expect(a.shots).toBe(0);applyShotRecoil(a,ak,2);expect(a.pitchVelocity).toBeCloseTo(b.pitchVelocity,5);
  });
  it('uses scoped AWP accuracy and the original M4 headshot multiplier',()=>{
    const awp=weapons.awp.tuning,state=newHandling();
    expect(weaponInaccuracy(awp,state,0,false,true,true)).toBeLessThan(weaponInaccuracy(awp,state,0,false,true,false)/10);
    const m4=weapons.m4a1;expect(resolveDamage(m4.damage,true,100,true,m4.armorPenetration,m4.headshotMultiplier).damage).toBe(93);
  });
  it('keeps cone offsets inside the combined authored spread radius',()=>{
    for(let i=0;i<100;i++){const o=spreadOffset(.02,.005);expect(Math.hypot(o.x,o.y)).toBeLessThanOrEqual(.025);}
  });
  it('does not accumulate a simulation-frame delay on every USP shot',()=>{
    let next=0,shots=0;for(let tick=1;tick<=120;tick++){const time=tick/60;if(time+1e-6>=next){shots++;next=nextAttackTime(next,time,weapons.usp.interval);}}
    expect(shots).toBe(12);
  });
});
