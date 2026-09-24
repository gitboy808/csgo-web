import * as THREE from 'three';
import type { WeaponId } from './types';

export class GameAudio {
  private ctx:AudioContext|null=null;
  private master!:GainNode;
  private buffers=new Map<string,AudioBuffer>();
  private volume=.7;
  position=new THREE.Vector3();yaw=0;
  async start(){
    if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);}
    if(this.ctx.state==='suspended')await this.ctx.resume();
  }
  setVolume(v:number){this.volume=v;if(this.master)this.master.gain.setTargetAtTime(v,this.ctx!.currentTime,.03);}
  private noise(name:string,duration:number,shape:(t:number,n:number)=>number) {
    if(!this.ctx)return null;
    const cached=this.buffers.get(name);if(cached)return cached;
    const buffer=this.ctx.createBuffer(1,Math.ceil(this.ctx.sampleRate*duration),this.ctx.sampleRate),data=buffer.getChannelData(0);
    let smooth=0;
    for(let i=0;i<data.length;i++){const t=i/this.ctx.sampleRate;const noise=Math.random()*2-1;smooth=.7*smooth+.3*noise;data[i]=shape(t,.7*noise+.3*smooth);}
    this.buffers.set(name,buffer);return buffer;
  }
  private play(buffer:AudioBuffer|null,gain:number,position?:THREE.Vector3,lowpass=15000,rate=1) {
    if(!this.ctx||!buffer)return;
    const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),level=this.ctx.createGain(),panner=this.ctx.createStereoPanner();
    source.buffer=buffer;source.playbackRate.value=rate;filter.type='lowpass';filter.frequency.value=lowpass;
    if(position){const d=position.distanceTo(this.position),relative=position.clone().sub(this.position);gain*=Math.min(1,9/(d+3));panner.pan.value=THREE.MathUtils.clamp((relative.x*Math.cos(this.yaw)-relative.z*Math.sin(this.yaw))/Math.max(2,d),-1,1);filter.frequency.value*=Math.max(.15,1-d/160);}
    level.gain.value=gain;source.connect(filter).connect(level).connect(panner).connect(this.master);source.start();
    source.onended=()=>{source.disconnect();filter.disconnect();level.disconnect();panner.disconnect();};
  }
  shot(id:WeaponId,position?:THREE.Vector3) {
    const silenced=id==='usp'||id==='m4a1',heavy=id==='awp'||id==='deagle';
    const buffer=this.noise('shot-'+id,heavy?.72:.43,(t,n)=>{
      const click=n*Math.exp(-t*(silenced?150:90));
      const body=Math.sin(2*Math.PI*(heavy?83:135)*t)*Math.exp(-t*(silenced?60:27));
      const tail=n*Math.exp(-t*(heavy?9:14))*.28;
      return Math.tanh((click+body*.85+tail)*2)*Math.min(1,t*3500);
    });
    this.play(buffer,silenced?.28:heavy?.75:.5,position,silenced?2700:12500,.97+Math.random()*.06);
  }
  step(position?:THREE.Vector3,quiet=false){this.play(this.noise('step',.17,(t,n)=>n*Math.exp(-t*35)*.5+Math.sin(2*Math.PI*90*t)*Math.exp(-t*45)*.3),quiet?.055:.13,position,2200,.88+Math.random()*.25);}
  reload(){this.play(this.noise('reload',.32,(t,n)=>n*(Math.exp(-t*60)+Math.exp(-Math.abs(t-.17)*100)*.6)),.22,undefined,5800);}
  impact(position?:THREE.Vector3){this.play(this.noise('impact',.13,(t,n)=>n*Math.exp(-t*70)),.22,position,6000);}
  hurt(){this.play(this.noise('hurt',.18,(t,n)=>n*Math.exp(-t*28)),.28,undefined,850);}
  explosion(position:THREE.Vector3){this.play(this.noise('explosion',1.9,(t,n)=>Math.tanh(n*3)*Math.exp(-t*3.8)+Math.sin(t*2*Math.PI*48)*Math.exp(-t*5)*.4),1.1,position,6500);}
  beep(frequency=900,duration=.09,gain=.09){
    if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=frequency;g.gain.setValueAtTime(gain,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+duration);o.connect(g).connect(this.master);o.start();o.stop(this.ctx.currentTime+duration);o.onended=()=>{o.disconnect();g.disconnect();};
  }
}
