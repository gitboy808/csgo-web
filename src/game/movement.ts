/** Metres internally; Source movement cvars and weapon data use inches. See docs/LOCAL_HUD_MOVEMENT.md. */
export const MOVEMENT=Object.freeze({unit:.0254,accelerate:5.5,airAccelerate:12,friction:5.2,stopSpeed:80*.0254,airWishSpeed:30*.0254,gravity:800*.0254,jump:301.99338*.0254,stepHeight:18*.0254,walk:.52,duck:.34});
interface Planar{x:number;z:number}
/** Friction followed by acceleration along the wish direction. Never rotate existing momentum with the view. */
export function moveSourceStyle(velocity:Planar,wish:Planar,maxSpeed:number,dt:number,grounded:boolean){
 let x=velocity.x,z=velocity.z;const length=Math.hypot(wish.x,wish.z),scale=length>1?1/length:1,wx=wish.x*scale,wz=wish.z*scale;
 if(grounded){const speed=Math.hypot(x,z);if(speed>0){const next=Math.max(0,speed-Math.max(speed,MOVEMENT.stopSpeed)*MOVEMENT.friction*dt);x*=next/speed;z*=next/speed;}}
 if(length>0){const wishSpeed=maxSpeed*Math.min(1,length),add=(grounded?wishSpeed:Math.min(wishSpeed,MOVEMENT.airWishSpeed))-(x*wx+z*wz);
  if(add>0){const amount=Math.min(add,(grounded?MOVEMENT.accelerate:MOVEMENT.airAccelerate)*wishSpeed*dt);x+=wx*amount;z+=wz*amount;}}
 return{x,z};
}
/** Walking/ducking become quiet only once actual ground speed has decayed, not on keydown. */
export function audibleFootstep(speed:number,maxSpeed:number,grounded:boolean){return grounded&&speed>Math.max(.5,maxSpeed*MOVEMENT.walk+ .0254);}
export function footstepInterval(speed:number){return Math.max(.29,Math.min(.48,.4-(speed/.0254-150)/100*.1));}
