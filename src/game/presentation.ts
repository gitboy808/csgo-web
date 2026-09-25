import type {MatchState,Phase,Side} from './types';
export type MusicCue='menu'|'freeze'|'action'|'planted'|'bomb10'|'round10'|'won'|'lost'|'death'|'mvp'|'start'|'end';
export type RadioCommand='letsgo'|'locknload'|'enemy'|'backup'|'takingfire'|'follow'|'hold'|'regroup'|'cover'|'roger'|'negative'|'he'|'flash'|'smoke'|'molotov'|'incendiary'|'decoy'|'planting'|'defusing'|'enemydown'|'oneleft';
export interface PresentationCue {type:'music'|'announce';key:string}
/** Edges are detected once, including both the round clock and the separate C4 clock. */
export class MatchPresentation {
  private round=0;private phase:Phase|null=null;private warnedRound=false;private warnedBomb=false;
  reset(){this.round=0;this.phase=null;this.warnedRound=this.warnedBomb=false;}
  update(match:MatchState):PresentationCue[]{
    const cues:PresentationCue[]=[];
    const music=(key:MusicCue)=>cues.push({type:'music',key});
    if(this.round!==match.round){this.round=match.round;this.phase=null;this.warnedRound=this.warnedBomb=false;}
    if(this.phase!==match.phase){
      if(match.phase==='freeze')music('freeze');
      if(match.phase==='live')music('action');
      if(match.phase==='planted'){music('planted');cues.push({type:'announce',key:'planted'});}
      if(match.phase==='end'){
        if(match.reason.includes('拆除'))cues.push({type:'announce',key:'defused'});
        cues.push({type:'announce',key:match.winner===null?'draw':match.sides[match.winner]==='CT'?'ctwin':'twin'});
        music(match.winner===0?'won':'lost');
      }
      if(match.phase==='finished')music('end');
      this.phase=match.phase;
    }
    if(match.phase==='live'&&match.remaining<=10&&!this.warnedRound){this.warnedRound=true;music('round10');}
    if(match.phase==='planted'&&match.bomb.remaining<=10&&!this.warnedBomb){this.warnedBomb=true;music('bomb10');}
    return cues;
  }
}
export interface RadioMessage {key:string;speaker:string;side?:Side;location?:string;priority:number;duration:number;expires:number}
/** A bounded, expiring radio channel: announcements interrupt tactical chatter. */
export class RadioQueue {
  private pending:RadioMessage[]=[];private cooldowns=new Map<string,number>();
  active:RadioMessage|null=null;until=0;
  enqueue(message:RadioMessage,now:number,cooldown=3){
    if((this.cooldowns.get(message.key)??-Infinity)>now)return false;
    this.cooldowns.set(message.key,now+cooldown);
    if(message.priority>=10)this.pending=this.pending.filter(m=>m.priority>=10);
    this.pending.push(message);this.pending.sort((a,b)=>b.priority-a.priority);this.pending=this.pending.slice(0,5);return true;
  }
  next(now:number):RadioMessage|null{
    this.pending=this.pending.filter(m=>m.expires>now);
    if(this.active&&now<this.until&&(!this.pending.length||this.pending[0].priority<=this.active.priority))return null;
    if(this.active&&now>=this.until)this.active=null;
    const message=this.pending.shift();if(!message)return null;
    this.active=message;this.until=now+message.duration+.12;return message;
  }
  clear(){this.pending=[];this.cooldowns.clear();this.active=null;this.until=0;}
  get length(){return this.pending.length;}
}
