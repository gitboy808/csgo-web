import {Matrix4,Vector3} from 'three';
import type {Source2MapData} from './source2-types';

export function source2WorldMatrix(){return new Matrix4().makeRotationY(Math.PI/2);}
export function source2SkyboxMatrix(sky:NonNullable<Source2MapData['skybox']>){
  return source2WorldMatrix().scale(new Vector3(sky.scale,sky.scale,sky.scale)).setPosition(-sky.origin.x*sky.scale,-sky.origin.y*sky.scale,-sky.origin.z*sky.scale);
}
