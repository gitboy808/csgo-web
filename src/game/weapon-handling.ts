import type {NativeWeaponTuning} from './types';

export interface WeaponHandling {pitch:number;yaw:number;pitchVelocity:number;yawVelocity:number;viewKick:number;penalty:number;shots:number;lastShot:number}
export const newHandling=():WeaponHandling=>({pitch:0,yaw:0,pitchVelocity:0,yawVelocity:0,viewKick:0,penalty:0,shots:0,lastShot:-100});
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const tables=new WeakMap<NativeWeaponTuning,{pitch:number;yaw:number}[]>();

function pattern(tuning:NativeWeaponTuning){
  let table=tables.get(tuning);if(table)return table;
  // A repeatable sequence driven by each weapon's authored recoil seed and variances.
  // Browser recoil dynamics are reconstructed; this does not implement Source 2 subtick code.
  let seed=Math.max(1,Math.abs(tuning.recoilSeed)%2147483647),angle=tuning.recoilAngle;
  const random=()=>{seed=seed*16807%2147483647;return (seed-1)/2147483646;};
  table=Array.from({length:64},(_,i)=>{
    angle+=(tuning.recoilAngle+(random()*2-1)*tuning.recoilAngleVariance-angle)*.55;
    const magnitude=(tuning.recoilMagnitude+(random()*2-1)*tuning.recoilMagnitudeVariance)*(.75+.25*clamp(i/4));
    return {pitch:Math.cos(angle*Math.PI/180)*magnitude*Math.PI/180*.7,yaw:Math.sin(angle*Math.PI/180)*magnitude*Math.PI/180*.7};
  });tables.set(tuning,table);return table;
}
export function applyShotRecoil(state:WeaponHandling,tuning:NativeWeaponTuning,time:number){
  const kick=pattern(tuning)[Math.min(63,state.shots)];state.pitchVelocity+=kick.pitch;state.yawVelocity+=kick.yaw;
  state.viewKick=Math.min(.025,state.viewKick+.003);state.penalty=Math.min(.5,state.penalty+tuning.fire);state.shots++;state.lastShot=time;
}
export function advanceHandling(state:WeaponHandling,tuning:NativeWeaponTuning,dt:number,time:number,crouched:boolean){
  const progress=clamp((state.shots-tuning.recoveryStart)/Math.max(1,tuning.recoveryEnd-tuning.recoveryStart));
  const start=crouched?tuning.recoveryCrouch:tuning.recoveryStand,end=crouched?tuning.recoveryCrouchFinal:tuning.recoveryStandFinal;
  const recovery=Math.max(.08,start+(end-start)*progress);
  state.penalty*=Math.pow(10,-dt/recovery);state.viewKick*=Math.exp(-18*dt);
  const omega=time-state.lastShot<.16?5.5:10,decay=Math.exp(-omega*dt);
  for(const [position,velocity]of [['pitch','pitchVelocity'],['yaw','yawVelocity']]as const){const c=state[velocity]+omega*state[position];state[position]=(state[position]+c*dt)*decay;state[velocity]=(state[velocity]-omega*c*dt)*decay;}
  if(time-state.lastShot>Math.max(.55,recovery*1.2)&&state.penalty<.002)state.shots=0;
}
export function weaponInaccuracy(tuning:NativeWeaponTuning,state:WeaponHandling,speed:number,crouched:boolean,grounded:boolean,scoped:boolean){
  const mode=scoped&&tuning.scoped?tuning.scoped:tuning;
  const move=clamp((speed/Math.max(.1,mode.maxSpeed)-.34)/.61);
  return (crouched?mode.crouch:mode.stand)+mode.move*move*move+state.penalty+(grounded?0:tuning.jump);
}
export function spreadOffset(inaccuracy:number,spread:number,random= Math.random){
  const angle1=random()*Math.PI*2,angle2=random()*Math.PI*2,r1=random()*inaccuracy,r2=random()*spread;
  return {x:Math.cos(angle1)*r1+Math.cos(angle2)*r2,y:Math.sin(angle1)*r1+Math.sin(angle2)*r2};
}
export const sourceVerticalFov=(horizontal:number)=>2*Math.atan(Math.tan(horizontal*Math.PI/360)*.75)*180/Math.PI;
export const nextAttackTime=(previous:number,now:number,interval:number)=>(now-previous<=1/60+1e-6?previous:now)+interval;
