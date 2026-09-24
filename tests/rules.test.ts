import { describe,it,expect } from 'vitest';
import { checkWin,endRound,newMatch,nextRound,purchase } from '../src/game/rules';
import { createWeapon,finishReload,resolveDamage } from '../src/game/weapons';
import type { Combatant,Team } from '../src/game/types';
const actor=(team:Team,id=team):Combatant=>({id,team,name:'test',alive:true,health:100,armor:0,helmet:false,kit:false,money:5000,kills:0,deaths:0,inventory:[createWeapon('usp'),createWeapon('knife')]});

describe('bomb defusal outcome precedence',()=>{
  it('keeps a planted bomb live after all attackers die',()=>{const m=newMatch('CT');m.phase='planted';const ct=actor(0),t=actor(1);t.alive=false;expect(checkWin(m,[ct,t])).toBeNull();m.bomb.remaining=0;expect(checkWin(m,[ct,t])?.winner).toBe(1);});
  it('ends an unplanted round on elimination or time',()=>{const m=newMatch('CT');m.phase='live';const ct=actor(0),t=actor(1);expect(checkWin(m,[ct,t])).toBeNull();m.remaining=0;expect(checkWin(m,[ct,t])?.winner).toBe(0);m.remaining=20;ct.alive=false;expect(checkWin(m,[ct,t])?.winner).toBe(1);});
  it('does not reward or score a round twice',()=>{const m=newMatch();m.phase='live';const a=actor(0);endRound(m,0,'won',[a]);const money=a.money;endRound(m,0,'won',[a]);expect(m.score).toEqual([1,0]);expect(a.money).toBe(money);});
});
describe('MR12 match progression',()=>{
  it('switches factions, not team scores, after round 12',()=>{const m=newMatch('T');m.round=12;m.score=[7,5];expect(nextRound(m)).toBe('halftime');expect(m.sides).toEqual(['CT','T']);expect(m.score).toEqual([7,5]);expect(m.round).toBe(13);});
  it('finishes at 13 wins or a 12:12 draw',()=>{const won=newMatch();won.round=19;won.score=[13,6];expect(nextRound(won)).toBe('finished');const tie=newMatch();tie.round=24;tie.score=[12,12];expect(nextRound(tie)).toBe('finished');});
  it('increments loss compensation and caps total money',()=>{const m=newMatch();const ct=actor(0),t=actor(1);t.money=0;ct.money=15900;for(let i=0;i<3;i++){m.phase='live';endRound(m,0,'win',[ct,t]);}expect(t.money).toBe(1400+1900+2400);expect(ct.money).toBe(16000);});
});
describe('purchasing and loadouts',()=>{
  it('rejects live, distant, wrong-side, duplicate and unaffordable purchases without charging',()=>{const m=newMatch('CT');const a=actor(0);expect(purchase(m,a,'ak47',true)).toBe(false);expect(purchase(m,a,'m4a1',false)).toBe(false);m.phase='live';expect(purchase(m,a,'m4a1',true)).toBe(false);m.phase='freeze';a.money=200;expect(purchase(m,a,'awp',true)).toBe(false);expect(purchase(m,a,'usp',true)).toBe(false);expect(a.money).toBe(200);});
  it('deducts exactly once and replaces only the matching weapon slot',()=>{const m=newMatch('CT');const a=actor(0);expect(purchase(m,a,'m4a1',true)).toBe(true);expect(a.money).toBe(2100);expect(a.inventory.map(w=>w.id)).toEqual(['m4a1','usp','knife']);expect(purchase(m,a,'deagle',true)).toBe(true);expect(a.inventory.map(w=>w.id)).toEqual(['deagle','m4a1','knife']);});
  it('allows defuse kits only for defenders',()=>{const m=newMatch('T'),a=actor(0);expect(purchase(m,a,'kit',true)).toBe(false);m.sides=['CT','T'];expect(purchase(m,a,'kit',true)).toBe(true);expect(a.kit).toBe(true);expect(purchase(m,a,'kit',true)).toBe(false);});
});
describe('weapon damage and ammunition',()=>{
  it('conserves ammunition when a magazine is partly full',()=>{const w=createWeapon('ak47');w.ammo=17;w.reserve=8;finishReload(w);expect(w.ammo).toBe(25);expect(w.reserve).toBe(0);});
  it('distinguishes a helmet from body armor and handles depleted armor',()=>{expect(resolveDamage(30,true,100,false,.5).damage).toBe(120);expect(resolveDamage(30,true,100,true,.5).damage).toBe(60);expect(resolveDamage(100,false,5,false,.5)).toEqual({damage:90,armorUsed:5});});
});
