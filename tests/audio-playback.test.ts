import{beforeEach,afterEach,describe,it,expect,vi}from'vitest';
import{readFileSync,existsSync}from'node:fs';
import{Vector3}from'three';
import{HitAudio}from'../src/game/hit-audio';
import{GameMedia}from'../src/game/media';
import type{GameAudio}from'../src/game/audio';
import type{Settings}from'../src/game/types';
class Node{
  gain={value:1,setTargetAtTime:vi.fn(),cancelScheduledValues:vi.fn()};pan={value:0};frequency={value:0};playbackRate={value:1};
  type='';buffer:unknown;onended:(()=>void)|null=null;start=vi.fn();stop=vi.fn();disconnect=vi.fn();connect(n:unknown){return n as Node;}
}
class Context{
  currentTime=0;state='running';sources:Node[]=[];
  createGain(){return new Node();}createStereoPanner(){return new Node();}createBiquadFilter(){return new Node();}
  createBufferSource(){const n=new Node();this.sources.push(n);return n;}createMediaElementSource(){return new Node();}
  async decodeAudioData(){return{duration:.25,length:12000,numberOfChannels:1};}
}
class MediaElement{
  static all:MediaElement[]=[];currentTime=0;duration=30;readyState=4;paused=true;preload='';loop=false;
  onended:(()=>void)|null=null;onloadedmetadata:(()=>void)|null=null;onerror:(()=>void)|null=null;
  constructor(public src:string){MediaElement.all.push(this);}async play(){this.paused=false;}pause(){this.paused=true;}
  removeAttribute(){this.src='';}load(){}
}
const audio=(ctx:Context)=>({context:ctx,output:new Node(),position:new Vector3(),yaw:0})as unknown as GameAudio;
beforeEach(()=>{vi.stubGlobal('OfflineAudioContext',Context);vi.stubGlobal('Audio',MediaElement);MediaElement.all=[];});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
const available=existsSync('public/assets/source2/hits/audio.json');
describe.skipIf(!available)('original hit audio bank',()=>{
  const load=async()=>{
    const events=JSON.parse(readFileSync('public/assets/source2/hits/audio.json','utf8'));
    const fetcher=vi.fn(async(url:string)=>({ok:true,json:async()=>events,arrayBuffer:async()=>new ArrayBuffer(url.length)}));vi.stubGlobal('fetch',fetcher);
    const ctx=new Context(),bank=new HitAudio(audio(ctx));await bank.prepare();return{ctx,bank,fetcher,events};
  };
  it('decodes each unique sample once and does no network work on hit',async()=>{
    const{bank,fetcher,events}=await load();const count=new Set(Object.values(events).flatMap((e:any)=>e.files)).size;
    expect(bank.status.files).toBe(count);expect(fetcher).toHaveBeenCalledTimes(count+1);
    bank.play({group:'chest',armored:false,lethal:false,perspective:'AttackerFeedback'},new Vector3(0,0,-3),1);
    expect(bank.status.played).toBe(1);expect(fetcher).toHaveBeenCalledTimes(count+1);bank.clear();
  });
  it('plays both helmet and flesh layers even though the lethal parent has zero gain',async()=>{
    const{ctx,bank}=await load();bank.play({group:'head',armored:true,lethal:true,perspective:'AttackerFeedback'},new Vector3(0,0,-3),1);
    expect(bank.status.active).toBe(2);expect(ctx.sources.map(s=>s.playbackRate.value)).toEqual([1,1.1]);
    bank.clear();expect(bank.status.active).toBe(0);expect(ctx.sources.every(s=>s.disconnect.mock.calls.length===1)).toBe(true);
  });
  it('caps hit voices under overload, preserves local cues, and clears delayed sources',async()=>{
    const{bank,ctx}=await load();for(let i=0;i<100;i++)bank.play({group:'head',armored:true,lethal:true,perspective:'Onlooker'},new Vector3(0,0,-2),i);
    expect(bank.status.active).toBeLessThanOrEqual(24);expect(bank.status.peak).toBe(24);
    const before=bank.status.played;bank.play({group:'chest',armored:false,lethal:false,perspective:'Victim'},new Vector3(),200);
    expect(bank.status.played).toBeGreaterThan(before);bank.clear();expect(bank.status.active).toBe(0);expect(ctx.sources.every(s=>s.stop.mock.calls.length===1)).toBe(true);
  });
  it('throttles repeated same-target hits but keeps unrelated targets independent',async()=>{
    const{ctx,bank}=await load(),hit={group:'head',armored:true,lethal:false,perspective:'AttackerFeedback'}as const,p=new Vector3(0,0,-2);
    bank.play(hit,p,1);bank.play(hit,p,1);bank.play(hit,p,2);expect(bank.status.played).toBe(2);
    ctx.currentTime=.11;bank.play(hit,p,1);expect(bank.status.played).toBe(3);bank.clear();
  });
});
describe('music streaming lifecycle',()=>{
  const settings={musicKit:'cs2',musicVolume:.3,radioVolume:.8}as Settings;
  const event={files:['a.mp3','b.mp3'],volume:.8,duration:30,loop:true,segments:[{start:.5,end:10},{start:1.5,end:12}],stopAt:0,fade:.4};
  async function load(){
    vi.useFakeTimers();const ctx=new Context(),events={menu:event,freeze:event,mvp:{...event,loop:false},bomb10:{...event,loop:false,stopAt:10}};
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({radio:{},music:{cs2:{events},ez4ence:{events}}})})));
    const media=new GameMedia(audio(ctx),()=>{});await media.prepare();media.settings(settings);return media;
  }
  it('streams nothing during prepare and keeps at most two streams on rapid preview changes',async()=>{
    const media=await load();expect(MediaElement.all).toHaveLength(0);media.unlock(false);
    for(let i=0;i<20;i++)media.music(i%2?'mvp':'menu',true);
    expect(MediaElement.all.filter(a=>a.src)).toHaveLength(2);expect(media.status.streams).toBe(2);
    vi.advanceTimersByTime(250);expect(media.status.streams).toBe(1);media.clear();expect(MediaElement.all.every(a=>!a.src&&a.paused)).toBe(true);
  });
  it('uses the selected variant loop window and never loops a finite MVP cue',async()=>{
    const media=await load();vi.spyOn(Math,'random').mockReturnValue(.9);media.unlock(false);media.music('freeze');
    const current=MediaElement.all.at(-1)!;current.onloadedmetadata?.();expect(current.currentTime).toBe(.5);
    current.currentTime=10.1;media.update();expect(current.currentTime).toBe(.5);
    media.music('freeze',true);const second=MediaElement.all.at(-1)!;second.onloadedmetadata?.();expect(second.currentTime).toBe(1.5);
    second.currentTime=12.1;media.update();expect(second.currentTime).toBe(1.5);
    media.music('mvp');const mvp=MediaElement.all.at(-1)!;mvp.currentTime=15;media.update();expect(mvp.currentTime).toBe(15);media.clear();
  });
  it('releases the old kit while paused and opens the new one only on resume',async()=>{
    const media=await load();media.unlock();media.setPaused(true);media.settings({...settings,musicKit:'ez4ence'});expect(media.status.streams).toBe(0);
    media.setPaused(false);expect(media.status.kit).toBe('ez4ence');expect(media.status.track?.playing).toBe(true);media.clear();
  });
  it('does not fetch or play silent music and resumes the selected cue when unmuted',async()=>{
    const media=await load();media.settings({...settings,musicVolume:0});media.unlock();expect(MediaElement.all).toHaveLength(0);
    media.music('mvp');media.settings(settings);expect(media.status.cue).toBe('mvp');expect(media.status.streams).toBe(1);
    media.settings({...settings,musicKit:'off'});expect(media.status.streams).toBe(0);media.clear();
  });
});
