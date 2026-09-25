import type{Vector3}from'three';
import{SpatialAudioBank,type SpatialAudioOutput}from'./spatial-audio';
import{hitSoundEvent,type HitFeedback}from'./hit-feedback';
export class HitAudio extends SpatialAudioBank{
 constructor(audio:SpatialAudioOutput){super(audio,`${import.meta.env.BASE_URL}assets/source2/hits/`,'部位命中');}
 play(hit:HitFeedback,position:Vector3,entity:number,occluded=false){
  const local=hit.perspective==='Victim';this.event(hitSoundEvent(hit),local?undefined:position,entity,local?3:hit.perspective==='AttackerFeedback'?2:0,occluded);
 }
}
