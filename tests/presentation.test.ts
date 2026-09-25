import {describe,it,expect} from 'vitest';
import {MatchPresentation,RadioQueue,type RadioMessage} from '../src/game/presentation';
import {newMatch,nextRound} from '../src/game/rules';

describe('match music and announcer sequencing',()=>{
  it('plays each cue once, gives the bomb its own ten-second warning, and sequences defuse before CT win',()=>{
    const director=new MatchPresentation(),match=newMatch();
    expect(director.update(match)).toEqual([{type:'music',key:'freeze'}]);expect(director.update(match)).toEqual([]);
    match.phase='live';match.remaining=115;expect(director.update(match)).toEqual([{type:'music',key:'action'}]);
    match.remaining=9.99;expect(director.update(match)).toEqual([{type:'music',key:'round10'}]);expect(director.update(match)).toEqual([]);
    match.phase='planted';match.bomb.remaining=40;expect(director.update(match)).toEqual([{type:'music',key:'planted'},{type:'announce',key:'planted'}]);
    match.bomb.remaining=10;expect(director.update(match)).toEqual([{type:'music',key:'bomb10'}]);expect(director.update(match)).toEqual([]);
    match.phase='end';match.winner=0;match.reason='炸弹已成功拆除';expect(director.update(match)).toEqual([{type:'announce',key:'defused'},{type:'announce',key:'ctwin'},{type:'music',key:'won'}]);
    expect(director.update(match)).toEqual([]);nextRound(match);expect(director.update(match)).toEqual([{type:'music',key:'freeze'}]);
  });
  it('resolves the winning faction after halftime and resets when a new match starts',()=>{
    const director=new MatchPresentation(),match=newMatch('T');match.phase='end';match.winner=0;
    expect(director.update(match)).toContainEqual({type:'announce',key:'twin'});
    match.round=12;nextRound(match);director.update(match);match.phase='end';expect(director.update(match)).toContainEqual({type:'announce',key:'draw'});
    match.winner=0;director.reset();expect(director.update(match)).toContainEqual({type:'announce',key:'ctwin'});
    match.phase='finished';expect(director.update(match)).toEqual([{type:'music',key:'end'}]);
  });
});
const message=(key:string,priority=1,expires=10):RadioMessage=>({key,speaker:'TEST',priority,duration:2,expires});
describe('radio channel',()=>{
  it('interrupts chatter with announcements without overlapping the defuse/winner sequence',()=>{
    const q=new RadioQueue();q.enqueue(message('enemy'),0);expect(q.next(0)?.key).toBe('enemy');
    q.enqueue(message('backup'),.1);q.enqueue(message('defused',10),.2);q.enqueue(message('ctwin',10),.2);
    expect(q.next(.2)?.key).toBe('defused');expect(q.next(.5)).toBeNull();expect(q.next(2.4)?.key).toBe('ctwin');expect(q.next(4.6)).toBeNull();
  });
  it('coalesces repeated contact calls, expires stale information and clears on pause',()=>{
    const q=new RadioQueue();expect(q.enqueue(message('enemy'),0,9)).toBe(true);expect(q.enqueue(message('enemy'),1,9)).toBe(false);
    q.enqueue(message('backup',1,1),0);expect(q.next(2)?.key).toBe('enemy');expect(q.next(5)).toBeNull();
    q.enqueue(message('hold'),5);q.clear();expect(q.active).toBeNull();expect(q.next(6)).toBeNull();expect(q.enqueue(message('enemy'),6)).toBe(true);
  });
});
