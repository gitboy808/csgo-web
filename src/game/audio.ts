import * as THREE from 'three';
import type { WeaponId } from './types';
import {HitAudio} from './hit-audio';
import type {HitFeedback} from './hit-feedback';
import{FootstepAudio}from'./footsteps';
import type{Side}from'./types';

export class GameAudio {
  readonly hits=new HitAudio(this);
  readonly footsteps=new FootstepAudio(this);
  private ctx:AudioContext|null=null;
  private master!:GainNode;
  private hearing!:BiquadFilterNode;private hearingAmount=-1;
  private volume=.7;
  private nativeEvents:Record<string,{files:string[];volume:number|number[];pitch:number|number[]}>={};
  private decoded=new Map<string,AudioBuffer>();
  private nativeShots:Partial<Record<WeaponId,string>>={};
  private nativePlayed=0;
  position=new THREE.Vector3();yaw=0;
  get context(){return this.ctx;}
  get output(){return this.master;}
  async start(){
    if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.hearing=this.ctx.createBiquadFilter();this.hearing.type='lowpass';this.hearing.frequency.value=22000;this.master.connect(this.hearing).connect(this.ctx.destination);}
    if(this.ctx.state==='suspended')await this.ctx.resume();
  }
  async prepareNative(root:string,parameters:Record<WeaponId,{shootEvent:string}>){
    for(const [id,p]of Object.entries(parameters))this.nativeShots[id as WeaponId]=p.shootEvent;
    await this.prepareAdditional(root);
  }

  nativeEvent(name:string,position?:THREE.Vector3,volumeScale=1){
    const event=this.nativeEvents[name.toLowerCase()];if(!event)return;
    const file=event.files[Math.floor(Math.random()*event.files.length)],buffer=this.decoded.get(file);if(!buffer)return;
    const scalar=(value:number|number[])=>Array.isArray(value)?value[0]+Math.random()*(value.at(-1)!-value[0]):value;
    this.play(buffer,scalar(event.volume)*volumeScale,position,20000,scalar(event.pitch));
    if(this.ctx?.state==='running')this.nativePlayed++;
  }
  async prepareAdditional(root:string){
    const response=await fetch(root+'audio.json');if(!response.ok)throw new Error('原始音效加载失败');const events=await response.json()as typeof this.nativeEvents;
    const decoder=new OfflineAudioContext(2,1,48000),files=[...new Set(Object.values(events).flatMap(e=>e.files))];let cursor=0;
    // Decode with bounded concurrency; discard compressed bytes immediately.
    await Promise.all(Array.from({length:6},async()=>{while(cursor<files.length){const file=files[cursor++],key=root+file;if(this.decoded.has(key))continue;const response=await fetch(key);if(!response.ok)throw new Error(`音效缺失：${file}`);this.decoded.set(key,await decoder.decodeAudioData(await response.arrayBuffer()));}}));
    for(const [key,event]of Object.entries(events))this.nativeEvents[key.toLowerCase()]={...event,files:event.files.map(file=>root+file)};
  }

  nativeLoop(name:string,position:THREE.Vector3,loop=true){
    const event=this.nativeEvents[name.toLowerCase()],ctx=this.ctx,buffer=event?this.decoded.get(event.files[0]):null;if(!ctx||!buffer||!event)return null;
    const gain=ctx.createGain(),pan=ctx.createStereoPanner();gain.connect(pan).connect(this.master);let source:AudioBufferSourceNode|null=null,stopped=false,paused=true,offset=0,started=0;
    const update=()=>{const dx=position.x-this.position.x,dz=position.z-this.position.z,d=Math.hypot(dx,position.y-this.position.y,dz);gain.gain.value=(Array.isArray(event.volume)?event.volume[0]:event.volume)*Math.min(1,7/(d+3));pan.pan.value=THREE.MathUtils.clamp((dx*Math.cos(this.yaw)-dz*Math.sin(this.yaw))/Math.max(2,d),-1,1);};
    const resume=()=>{if(stopped||!paused||!loop&&offset>=buffer.duration)return;paused=false;source=ctx.createBufferSource();source.buffer=buffer;source.loop=loop;source.connect(gain);source.start(0,loop?offset%buffer.duration:offset);started=ctx.currentTime;};
    const pause=()=>{if(stopped||paused)return;offset+=ctx.currentTime-started;paused=true;source?.stop();source?.disconnect();source=null;};
    resume();update();return{update,pause,resume,stop:()=>{if(stopped)return;pause();stopped=true;gain.disconnect();pan.disconnect();}};
  }
  flashDeafening(amount:number){amount=Math.min(1,Math.max(0,amount));if(Math.abs(amount-this.hearingAmount)<.005)return;this.hearingAmount=amount;if(this.ctx&&this.hearing)this.hearing.frequency.setTargetAtTime(22000-amount*21300,this.ctx.currentTime,.12);}
  get nativeStatus(){return {events:Object.keys(this.nativeEvents).length,files:this.decoded.size,decoded:this.decoded.size,played:this.nativePlayed,state:this.ctx?.state??'inactive'};}
  setVolume(v:number){this.volume=v;if(this.master)this.master.gain.setTargetAtTime(v,this.ctx!.currentTime,.03);}
  private play(buffer:AudioBuffer|null,gain:number,position?:THREE.Vector3,lowpass=15000,rate=1) {
    if(!this.ctx||!buffer)return;
    const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),level=this.ctx.createGain(),panner=this.ctx.createStereoPanner();
    source.buffer=buffer;source.playbackRate.value=rate;filter.type='lowpass';filter.frequency.value=lowpass;
    if(position){const d=position.distanceTo(this.position),relative=position.clone().sub(this.position);gain*=Math.min(1,9/(d+3));panner.pan.value=THREE.MathUtils.clamp((relative.x*Math.cos(this.yaw)-relative.z*Math.sin(this.yaw))/Math.max(2,d),-1,1);filter.frequency.value*=Math.max(.15,1-d/160);}
    level.gain.value=gain;source.connect(filter).connect(level).connect(panner).connect(this.master);source.start();
    source.onended=()=>{source.disconnect();filter.disconnect();level.disconnect();panner.disconnect();};
  }
  shot(id:WeaponId,position?:THREE.Vector3){const event=this.nativeShots[id];if(event)this.nativeEvent(event,position);}
  step(position?:THREE.Vector3,quiet=false,surface='concrete',side:Side='CT',entity=0,kind:'step'|'land'|'jump'='step',occluded=false,gain=1){
    if(quiet&&kind==='step')return;
    this.footsteps.play(surface,side,kind,position,entity,occluded,gain);
  }
  hit(feedback:HitFeedback,position:THREE.Vector3,entity:number,occluded=false){this.hits.play(feedback,position,entity,occluded);}
  hurt(burning=false){this.hits.event(burning?'Player.BurnDamage':'Player.DamageBody.Victim');}
  beep(frequency=900,duration=.09,gain=.09){
    if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=frequency;g.gain.setValueAtTime(gain,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+duration);o.connect(g).connect(this.master);o.start();o.stop(this.ctx.currentTime+duration);o.onended=()=>{o.disconnect();g.disconnect();};
  }
}
