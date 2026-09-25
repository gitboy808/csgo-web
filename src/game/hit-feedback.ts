export type HitGroup='head'|'neck'|'chest'|'stomach'|'leftArm'|'rightArm'|'leftLeg'|'rightLeg';
export type HitPerspective='AttackerFeedback'|'Victim'|'Onlooker';
export interface HitFeedback {group:HitGroup;armored:boolean;lethal:boolean;perspective:HitPerspective}
export function armorProtects(group:HitGroup,armor:number,helmet:boolean){
  return armor>0&&(group==='head'?helmet:group!=='neck'&&group!=='leftLeg'&&group!=='rightLeg');
}
export function hitSoundEvent(hit:HitFeedback){
  return `Player.${hit.lethal?'Death':'Damage'}${hit.group==='head'?'HeadShot':'Body'}${hit.armored?'Armor':''}.${hit.perspective}`;
}
export type SoundCurve=number[][];
/** Source distance keys are inches, while the browser world is in metres. */
export function soundDistanceGain(curve:SoundCurve,distance:number){
  const x=Math.max(0,distance)/.0254;
  if(!curve.length)return 1;
  if(x<=curve[0][0])return curve[0][1];
  for(let i=1;i<curve.length;i++){
    const a=curve[i-1],b=curve[i];if(x>b[0])continue;
    const width=b[0]-a[0],t=(x-a[0])/width,t2=t*t,t3=t2*t;
    // Hermite tangents from the exported curve, bounded against audible overshoot.
    const value=(2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*width*a[3]+(-2*t3+3*t2)*b[1]+(t3-t2)*width*b[2];
    return Math.max(Math.min(a[1],b[1]),Math.min(Math.max(a[1],b[1]),value));
  }
  return curve.at(-1)![1];
}
