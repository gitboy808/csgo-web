import{Ray,Vector3,type Object3D}from'three';
import type{Side}from'../game/types';
import type{HitGroup}from'../game/hit-feedback';
import{AGENT_BOUND_RADIUS}from'./actor-visibility';
export interface HitboxDefinition{bone:string;group:HitGroup;a:number[];b:number[];radius:number}
interface BoundHitbox{bone:Object3D;a:Vector3;b:Vector3;worldA:Vector3;worldB:Vector3;radius:number;group:HitGroup}
/** Exact intersection with the union of a cylinder and its two spherical caps. */
export function rayCapsule(ray:Ray,a:Vector3,b:Vector3,radius:number){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ox=ray.origin.x-a.x,oy=ray.origin.y-a.y,oz=ray.origin.z-a.z;
  const length=dx*dx+dy*dy+dz*dz,along=dx*ray.direction.x+dy*ray.direction.y+dz*ray.direction.z,originAlong=dx*ox+dy*oy+dz*oz;
  const proj=ox*ray.direction.x+oy*ray.direction.y+oz*ray.direction.z,originSq=ox*ox+oy*oy+oz*oz;
  const closest=length?Math.max(0,Math.min(1,originAlong/length)):0;
  if((ox-dx*closest)**2+(oy-dy*closest)**2+(oz-dz*closest)**2<=radius*radius)return 0;
  let result=Infinity;
  const A=length-along*along,B=length*proj-originAlong*along,C=length*originSq-originAlong*originAlong-radius*radius*length,discriminant=B*B-A*C;
  if(A>1e-10&&discriminant>=0){const t=(-B-Math.sqrt(discriminant))/A,y=originAlong+t*along;if(t>=0&&y>=0&&y<=length)result=t;}
  for(let i=0;i<2;i++){const cap=i===0?a:b,x=ray.origin.x-cap.x,y=ray.origin.y-cap.y,z=ray.origin.z-cap.z,p=x*ray.direction.x+y*ray.direction.y+z*ray.direction.z,h=p*p-(x*x+y*y+z*z-radius*radius);if(h>=0){const t=-p-Math.sqrt(h);if(t>=0)result=Math.min(result,t);}}
  return result;
}
export class CharacterHitboxes{
  private definitions:Partial<Record<Side,HitboxDefinition[]>>={};private bound=new WeakMap<Object3D,BoundHitbox[]>();
  private center=new Vector3();
  async prepare(){const r=await fetch(`${import.meta.env.BASE_URL}assets/source2/hits/hitboxes.json`);if(!r.ok)throw new Error('角色原始命中区域未准备完成');this.definitions=await r.json();}
  candidate(ray:Ray,position:Vector3){this.center.copy(position).y+=1;return ray.distanceSqToPoint(this.center)<AGENT_BOUND_RADIUS**2;}
  raycast(ray:Ray,root:Object3D,side:Side,position:Vector3,maxDistance:number):{distance:number;group:HitGroup}|null{
    if(!this.candidate(ray,position))return null;
    let distance=maxDistance,group:HitGroup|null=null;
    if(this.definitions[side]){
      let boxes=this.bound.get(root);
      if(!boxes){const bones=new Map<string,Object3D>();root.traverse(o=>bones.set(o.name.toLowerCase(),o));boxes=this.definitions[side]!.map(d=>{const bone=bones.get(d.bone);if(!bone)throw new Error('Missing hitbox bone '+d.bone);return{bone,a:new Vector3().fromArray(d.a),b:new Vector3().fromArray(d.b),worldA:new Vector3(),worldB:new Vector3(),radius:d.radius,group:d.group};});this.bound.set(root,boxes);}
      root.updateWorldMatrix(true,true);
      for(const box of boxes){box.worldA.copy(box.a).applyMatrix4(box.bone.matrixWorld);box.worldB.copy(box.b).applyMatrix4(box.bone.matrixWorld);const t=rayCapsule(ray,box.worldA,box.worldB,box.radius*box.bone.matrixWorld.getMaxScaleOnAxis());if(t<distance){distance=t;group=box.group;}}
    }
    return group?{distance,group}:null;
  }
}
