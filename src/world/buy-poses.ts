import type {Object3D} from 'three';
import type {Side,WeaponId,GrenadeId} from '../game/types';
export type BuyPose=Record<string,{translation?:number[];rotation?:number[];scale?:number[]}>;
export type BuyPoseLibrary=Record<Side,Record<WeaponId|GrenadeId,BuyPose>>;
/** The offline exporter has already retargeted the Source UI pose to this agent. */
export function applyBuyPose(root:Object3D,pose:BuyPose){
  let applied=0;
  for(const [name,transform]of Object.entries(pose)){
    const bone=root.getObjectByName(name);if(!bone)continue;
    if(transform.translation)bone.position.fromArray(transform.translation);
    if(transform.rotation)bone.quaternion.fromArray(transform.rotation).normalize();
    if(transform.scale)bone.scale.fromArray(transform.scale);
    bone.updateMatrix();applied++;
  }
  root.updateMatrixWorld(true);return applied;
}
