import type {Vector3} from 'three';
import {soundDistanceGain,type SoundCurve} from './hit-feedback';
interface SpatialEvent {files:string[];volume:number;volumeRandom?:[number,number];pitch:number;pitchRandom:[number,number];delay:number;cooldown:number;limit:number;curve?:SoundCurve;children:string[]}
interface Voice {source:AudioBufferSourceNode;gain:GainNode;pan:StereoPannerNode;filter:BiquadFilterNode;key:string;priority:number}
export interface SpatialAudioOutput {readonly context:AudioContext|null;readonly output:AudioNode;readonly position:Readonly<Vector3>;readonly yaw:number}
const MAX_SPATIAL_VOICES=24;
/** Short, predecoded samples; one bounded bank shared by all ten actors. */
export class SpatialAudioBank {
  private events:Record<string,SpatialEvent>={};private buffers=new Map<string,AudioBuffer>();
  private voices=new Set<Voice>();private lastVariant=new Map<string,number>();private lastPlayed=new Map<string,number>();
  private played=0;private peak=0;private dropped=0;private encodedBytes=0;private decodeMs=0;protected lastEvent='';
  ready=false;
  constructor(private audio:SpatialAudioOutput,private root:string,private label:string){}
  async prepare(){
    const root=this.root,response=await fetch(root+'audio.json');
    if(!response.ok)throw new Error(this.label+'音效未准备完成');
    this.events=await response.json();
    const files=[...new Set(Object.values(this.events).flatMap(e=>e.files))],decoder=new OfflineAudioContext(2,1,48000);let cursor=0;
    await Promise.all(Array.from({length:4},async()=>{while(cursor<files.length){
      const file=files[cursor++],r=await fetch(root+file);if(!r.ok)throw new Error(this.label+'音效缺失：'+file);
      const bytes=await r.arrayBuffer();this.encodedBytes+=bytes.byteLength;const start=performance.now();
      this.buffers.set(file,await decoder.decodeAudioData(bytes));this.decodeMs+=performance.now()-start;
    }}));
    this.ready=true;
  }
  event(name:string,position?:Vector3,entity=0,priority=3,occluded=false,depth=0,volumeScale=1){
    const ctx=this.audio.context;if(!this.ready||!ctx||ctx.state!=='running'||depth>3)return;
    name=name.toLowerCase();const event=this.events[name];if(!event)return;this.lastEvent=name;
    const key=name+':'+entity,now=ctx.currentTime;
    if(now-(this.lastPlayed.get(key)??-Infinity)<event.cooldown)return;
    this.lastPlayed.set(key,now);
    const dx=position?position.x-this.audio.position.x:0,dy=position?position.y-this.audio.position.y:0,dz=position?position.z-this.audio.position.z:0,distance=Math.hypot(dx,dy,dz);
    const randomVolume=event.volumeRandom?event.volumeRandom[0]+Math.random()*(event.volumeRandom[1]-event.volumeRandom[0]):0;
    const gain=Math.max(0,event.volume+randomVolume)*volumeScale*(event.curve?soundDistanceGain(event.curve,distance):1)*(occluded?.25:1);
    if(event.files.length&&gain>.0005){
      const n=event.files.length,previous=this.lastVariant.get(name)??-1,index=n>1?(previous+1+Math.floor(Math.random()*(n-1)))%n:0;
      const buffer=this.buffers.get(event.files[index]);
      if(buffer){
        const same=[...this.voices].filter(v=>v.key===key);
        if(same.length>=event.limit)this.release(same[0],true);
        if(this.voices.size>=MAX_SPATIAL_VOICES){
          let victim:Voice|undefined;for(const v of this.voices)if(!victim||v.priority<victim.priority)victim=v;
          if(victim&&victim.priority<=priority)this.release(victim,true);else{this.dropped++;return;}
        }
        const source=ctx.createBufferSource(),level=ctx.createGain(),pan=ctx.createStereoPanner(),filter=ctx.createBiquadFilter();
        source.buffer=buffer;source.playbackRate.value=event.pitch+event.pitchRandom[0]+Math.random()*(event.pitchRandom[1]-event.pitchRandom[0]);
        level.gain.value=gain;pan.pan.value=position?Math.max(-1,Math.min(1,(dx*Math.cos(this.audio.yaw)-dz*Math.sin(this.audio.yaw))/Math.max(.5,distance))):0;
        filter.type='lowpass';filter.frequency.value=occluded?2400:22000;
        source.connect(filter).connect(level).connect(pan).connect(this.audio.output);
        const voice:Voice={source,gain:level,pan,filter,key,priority};this.voices.add(voice);source.onended=()=>this.release(voice);
        source.start(now+event.delay);this.lastVariant.set(name,index);this.played++;this.peak=Math.max(this.peak,this.voices.size);
      }
    }
    // Children own their gain and delay; a muted parent does not mute its layers.
    for(const child of event.children)this.event(child,position,entity,priority,occluded,depth+1,volumeScale);
  }
  private release(voice:Voice,stop=false){
    if(!this.voices.delete(voice))return;voice.source.onended=null;if(stop)voice.source.stop();
    voice.source.disconnect();voice.filter.disconnect();voice.gain.disconnect();voice.pan.disconnect();
  }
  clear(){for(const voice of this.voices)this.release(voice,true);this.lastPlayed.clear();}
  get status(){return{ready:this.ready,events:Object.keys(this.events).length,files:this.buffers.size,encodedBytes:this.encodedBytes,decodedBytes:[...this.buffers.values()].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0),decodeMs:Math.round(this.decodeMs),active:this.voices.size,peak:this.peak,limit:MAX_SPATIAL_VOICES,played:this.played,dropped:this.dropped,lastEvent:this.lastEvent};}
}
