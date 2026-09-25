import type {GameAudio} from './audio';
import type {Settings,Side} from './types';
import {RadioQueue,type MusicCue,type RadioCommand,type RadioMessage} from './presentation';
interface VoiceVariant {event:string;files:string[];volume:number;duration:number}
interface VoiceGroup {text:string;variants:VoiceVariant[]}
interface MusicEvent {files:string[];volume:number;duration:number;loop:boolean;segments:{start:number;end:number}[];stopAt:number;fade:number}
interface MediaManifest {radio:Record<string,VoiceGroup>;music:Record<string,{name:string;events:Record<MusicCue,MusicEvent>}>}
interface MusicTrack {audio:HTMLAudioElement;source:MediaElementAudioSourceNode;gain:GainNode;event:MusicEvent;segment:{start:number;end:number};cue:MusicCue;file:string;stopping:boolean;timer?:ReturnType<typeof setTimeout>}
export interface RadioSubtitle {speaker:string;text:string;side?:Side;location?:string}
export class GameMedia {
  private root=`${import.meta.env.BASE_URL}assets/source2/media/`;
  private manifest:MediaManifest|null=null;private decoded=new Map<string,AudioBuffer>();
  private queue=new RadioQueue();private selected=new Map<string,VoiceVariant>();private lastVariant=new Map<string,number>();
  private radioGain:GainNode|null=null;private musicGain:GainNode|null=null;private voice:AudioBufferSourceNode|null=null;
  private track:MusicTrack|null=null;private retiring:MusicTrack|null=null;private musicVariants=new Map<string,number>();private cue:MusicCue='menu';private paused=false;private enabled=false;private playbackErrors:string[]=[];
  private radioVolume=.8;private musicVolume=.35;private kit='cs2';private voicePlayed=0;private musicPlayed=0;private voiceUntil=0;
  private appliedRadio=NaN;private appliedMusic=NaN;
  constructor(private audio:GameAudio,private subtitle:(message:RadioSubtitle)=>void){}
  async prepare(){
    const response=await fetch(this.root+'manifest.json');if(!response.ok)throw new Error('无线电与音乐盒资源未准备完成');this.manifest=await response.json();
    const files=[...new Set(Object.values(this.manifest!.radio).flatMap(g=>g.variants.flatMap(v=>v.files)))],decoder=new OfflineAudioContext(2,1,48000);
    // Music streams only when selected; short radio lines are decoded up front.
    let cursor=0;await Promise.all(Array.from({length:6},async()=>{while(cursor<files.length){const file=files[cursor++],r=await fetch(this.root+file);if(!r.ok)throw new Error(`语音加载失败：${file}`);this.decoded.set(file,await decoder.decodeAudioData(await r.arrayBuffer()));}}));
  }
  unlock(autoplay=true){
    const ctx=this.audio.context;if(!ctx||!this.manifest)return;
    if(!this.radioGain){this.radioGain=ctx.createGain();this.radioGain.connect(this.audio.output);this.musicGain=ctx.createGain();this.musicGain.connect(this.audio.output);this.setGains();}
    this.enabled=true;
    if(autoplay&&!this.paused){if(this.track)void this.track.audio.play().catch(e=>this.error(e));else this.music(this.cue,true);}
  }
  settings(settings:Settings){const changed=this.kit!==settings.musicKit,wasMuted=this.musicVolume===0;this.radioVolume=settings.radioVolume;this.musicVolume=settings.musicVolume;this.kit=settings.musicKit;this.setGains();if(changed||this.musicVolume===0)this.stopMusic(true);if(changed||wasMuted&&this.musicVolume>0)this.music(this.cue,true);}
  private setGains(){const ctx=this.audio.context;if(!ctx)return;const music=this.musicVolume*(ctx.currentTime<this.voiceUntil ? .35 : 1);if(this.radioGain&&this.appliedRadio!==this.radioVolume){this.radioGain.gain.setTargetAtTime(this.radioVolume,ctx.currentTime,.04);this.appliedRadio=this.radioVolume;}if(this.musicGain&&this.appliedMusic!==music){this.musicGain.gain.setTargetAtTime(music,ctx.currentTime,.12);this.appliedMusic=music;}}
  announce(role:string){this.enqueue('announcer.'+role,'战场播报',10,undefined,undefined,0);}
  radio(side:Side,command:RadioCommand,speaker:string,location:string,manual=false){return this.enqueue(side+'.'+command,speaker,manual?3:1,side,location,manual?1.8:['enemy','takingfire','enemydown'].includes(command)?9:4);}
  private enqueue(key:string,speaker:string,priority:number,side?:Side,location?:string,cooldown=3){
    const group=this.manifest?.radio[key];if(!group||!this.enabled||this.paused)return false;
    const n=group.variants.length,previous=this.lastVariant.get(key)??-1,index=n>1?(previous+1+Math.floor(Math.random()*(n-1)))%n:0,variant=group.variants[index];
    const buffer=this.decoded.get(variant.files[0]);if(!buffer)return false;
    const now=performance.now()/1000,message:RadioMessage={key,speaker,side,location,priority,duration:buffer.duration,expires:now+(priority>=10?12:4)};
    if(!this.queue.enqueue(message,now,cooldown))return false;this.selected.set(key,variant);this.lastVariant.set(key,index);return true;
  }
  private playVoice(message:RadioMessage){
    const ctx=this.audio.context,group=this.manifest?.radio[message.key],variant=this.selected.get(message.key);if(!ctx||!this.radioGain||!group||!variant)return;
    const buffer=this.decoded.get(variant.files[0]);if(!buffer)return;
    this.voice?.stop();const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=variant.volume;source.connect(gain).connect(this.radioGain);source.start();this.voice=source;this.voicePlayed++;this.voiceUntil=ctx.currentTime+buffer.duration;
    source.onended=()=>{source.disconnect();gain.disconnect();if(this.voice===source)this.voice=null;};this.setGains();
    this.subtitle({speaker:message.speaker,text:group.text,side:message.side,location:message.location});
  }
  music(cue:MusicCue,force=false){
    if(this.cue===cue&&!force&&this.track)return;this.cue=cue;
    // Let the MVP anthem finish across the following buy time. Action, objective
    // warnings and a deliberate preview still interrupt it immediately.
    if(!force&&cue==='freeze'&&this.track?.cue==='mvp')return;
    if(!this.enabled||this.paused)return;
    const event=this.manifest?.music[this.kit]?.events[cue];if(!event||this.kit==='off'||this.musicVolume===0){this.stopMusic(true);return;}
    const ctx=this.audio.context!;if(!this.musicGain)return;
    this.stopMusic();const key=this.kit+':'+cue,n=event.files.length,previous=this.musicVariants.get(key)??-1,index=n>1?(previous+1+Math.floor(Math.random()*(n-1)))%n:0;this.musicVariants.set(key,index);
    const file=event.files[index],segment=event.segments[index]??{start:0,end:0},audio=new Audio(this.root+file);audio.preload='metadata';audio.loop=event.loop&&!segment.end;
    const source=ctx.createMediaElementSource(audio),gain=ctx.createGain();gain.gain.value=0;source.connect(gain).connect(this.musicGain);gain.gain.setTargetAtTime(event.volume,ctx.currentTime,.08);
    const track:MusicTrack={audio,source,gain,event,segment,cue,file,stopping:false};this.track=track;
    audio.onloadedmetadata=()=>{if(!track.stopping&&segment.start>0)audio.currentTime=segment.start;};
    audio.onended=()=>{const current=this.track===track;this.releaseTrack(track);if(current&&this.cue!==track.cue)this.music(this.cue,true);};
    audio.onerror=()=>this.error(new Error('音乐加载失败：'+file));
    void audio.play().then(()=>{if(!track.stopping)this.musicPlayed++;}).catch(e=>{if(!track.stopping)this.error(e);});
  }
  private releaseTrack(track:MusicTrack){
    clearTimeout(track.timer);track.stopping=true;track.audio.onended=track.audio.onerror=track.audio.onloadedmetadata=null;
    track.audio.pause();track.audio.removeAttribute('src');track.audio.load();track.source.disconnect();track.gain.disconnect();
    if(this.track===track)this.track=null;if(this.retiring===track)this.retiring=null;
  }
  private stopMusic(immediate=false){
    // Keep at most one current and one fading stream, even during rapid switching.
    if(this.retiring)this.releaseTrack(this.retiring);
    const track=this.track;if(!track)return;this.track=null;track.stopping=true;const ctx=this.audio.context!;
    if(immediate||this.paused){this.releaseTrack(track);return;}
    track.gain.gain.cancelScheduledValues(ctx.currentTime);track.gain.gain.setTargetAtTime(0,ctx.currentTime,.065);
    this.retiring=track;track.timer=setTimeout(()=>this.releaseTrack(track),240);
  }
  update(){
    if(!this.enabled||this.paused)return;
    const next=this.queue.next(performance.now()/1000);if(next)this.playVoice(next);this.setGains();
    const track=this.track;if(!track)return;
    if(track.event.stopAt&&track.audio.currentTime>=track.event.stopAt)this.stopMusic();
    else if(track.event.loop&&track.segment.end&&track.audio.currentTime>=track.segment.end)track.audio.currentTime=track.segment.start;
  }
  setPaused(paused:boolean){
    if(this.paused===paused)return;this.paused=paused;
    if(paused){this.queue.clear();this.voice?.stop();this.voice=null;this.voiceUntil=0;this.track?.audio.pause();if(this.retiring)this.releaseTrack(this.retiring);}
    else if(this.enabled){if(this.track)void this.track.audio.play().catch(e=>this.error(e));else this.music(this.cue,true);}
    this.setGains();
  }
  clear(){this.queue.clear();this.selected.clear();this.voice?.stop();this.voice=null;this.voiceUntil=0;this.stopMusic(true);}
  private error(error:unknown){if(error instanceof DOMException&&error.name==='AbortError')return;const text=error instanceof Error?error.message:String(error);this.playbackErrors.push(text);if(this.playbackErrors.length>5)this.playbackErrors.shift();console.warn('媒体播放:',text);}
  get status(){return {enabled:this.enabled,paused:this.paused,radioGroups:Object.keys(this.manifest?.radio??{}).length,decoded:this.decoded.size,radioPlayed:this.voicePlayed,musicPlayed:this.musicPlayed,musicKits:Object.keys(this.manifest?.music??{}).length,streams:Number(!!this.track)+Number(!!this.retiring),queue:this.queue.length,kit:this.kit,cue:this.cue,track:this.track?{file:this.track.file,segment:this.track.segment,time:this.track.audio.currentTime,duration:Number.isFinite(this.track.audio.duration)?this.track.audio.duration:null,playing:!this.track.audio.paused,ready:this.track.audio.readyState}:null,errors:this.playbackErrors};}
}
