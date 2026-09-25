import type{Vector3}from'three';
import type{Side}from'./types';
import{SpatialAudioBank,type SpatialAudioOutput}from'./spatial-audio';
type SurfaceEvents=Record<Side,Record<string,{step:string;land:string}>>;
/** Shared sample storage, original per-surface events and a separate 24-voice budget. */
export class FootstepAudio extends SpatialAudioBank{
 private surfaces:SurfaceEvents={CT:{},T:{}};
 constructor(audio:SpatialAudioOutput){super(audio,`${import.meta.env.BASE_URL}assets/source2/movement/`,'脚步');}
 override async prepare(){
  const r=await fetch(`${import.meta.env.BASE_URL}assets/source2/movement/surfaces.json`);if(!r.ok)throw new Error('脚步材质映射缺失');this.surfaces=await r.json();await super.prepare();
 }
 play(surface:string,side:Side,kind:'step'|'land'|'jump',position?:Vector3,entity=0,occluded=false,gain=1){
  if(kind==='jump'){this.event('Gear.JumpLand.'+side,position,entity,position?0:3,occluded,0,.45);return;}
  const e=this.surfaces[side][surface.toLowerCase()]??this.surfaces[side].default;if(e)this.event(e[kind],position,entity,position?0:3,occluded,0,gain);
 }
}
