import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { makeMapGeometry, type Surface } from '../world/map';
import type { Vec3 } from './types';

export class Physics {
  world!:RAPIER.World;
  controller!:RAPIER.KinematicCharacterController;
  materials=new Map<number,Surface>();
  async init() {
    await RAPIER.init();
    this.world=new RAPIER.World({x:0,y:-20,z:0});this.world.timestep=1/60;
    this.controller=this.world.createCharacterController(.015);
    this.controller.enableAutostep(.37,.2,false);this.controller.enableSnapToGround(.35);
    this.controller.setMaxSlopeClimbAngle(Math.PI*.27);this.controller.setMinSlopeSlideAngle(Math.PI*.3);
    const map=makeMapGeometry();
    const floor=this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(map.positions),new Uint32Array(map.indices)).setCollisionGroups(0x00010003));
    this.materials.set(floor.handle,'stone');
    for(const s of map.solids) {
      const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),s.rotation||0);
      const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(s.w/2,s.h/2,s.d/2).setTranslation(s.x,s.y,s.z).setRotation(q).setCollisionGroups(0x00010003));
      this.materials.set(collider.handle,s.material);
    }
  }
  character(position:Vec3) {
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x,position.y+.9,position.z));
    const collider=this.world.createCollider(RAPIER.ColliderDesc.capsule(.58,.32).setCollisionGroups(0x00020001),body);
    return {body,collider};
  }
  move(body:RAPIER.RigidBody,collider:RAPIER.Collider,delta:Vec3) {
    this.controller.computeColliderMovement(collider,delta,RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC|RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    const d=this.controller.computedMovement(),p=body.translation();
    body.setNextKinematicTranslation({x:p.x+d.x,y:p.y+d.y,z:p.z+d.z});
    return this.controller.computedGrounded();
  }
  resize(collider:RAPIER.Collider,crouched:boolean) { collider.setShape(new RAPIER.Capsule(crouched?.305:.58,.32)); }
  ray(origin:Vec3,direction:Vec3,length:number,skip?:number) {
    return this.world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),length,true,RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC|RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,0x00010001,undefined,undefined,c=>c.handle!==skip);
  }
  canSee(a:Vec3,b:Vec3) {
    const delta=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),d=delta.length();
    return d<.001||!this.ray(a,delta.multiplyScalar(1/d),Math.max(0,d-.25));
  }
}
