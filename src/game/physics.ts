import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Vec3 } from './types';
import type { Source2MapData } from '../world/source2-types';
import type {GrenadeCollision} from './grenades';
import{MOVEMENT}from'./movement';

export class Physics {
  world!:RAPIER.World;
  controller!:RAPIER.KinematicCharacterController;
  materials=new Map<number,'wood'|'metal'|'sand'|'stone'>();
  private floorMaterials=new Map<number,string>();
  private characters=new Set<RAPIER.Collider>();
  private pawnContact:Vec3|null=null;
  readonly movement=new THREE.Vector3();
  private grenadeHull=new RAPIER.Ball(.0508);
  async init(source:Source2MapData,collisionBytes?:ArrayBuffer) {
    await RAPIER.init();
    this.world=new RAPIER.World({x:0,y:-20,z:0});this.world.timestep=1/60;
    this.controller=this.world.createCharacterController(.015);
    this.controller.enableAutostep(MOVEMENT.stepHeight,.18,false);this.controller.enableSnapToGround(.35);
    this.controller.setMaxSlopeClimbAngle(50*Math.PI/180);this.controller.setMinSlopeSlideAngle(Math.PI*.3);
    const bytes=collisionBytes??await(await fetch(`${import.meta.env.BASE_URL}assets/source2/${source.collision.file}`)).arrayBuffer();
    for(const group of source.collision.groups){
      const positions=new Float32Array(bytes,group.vertexOffset,group.vertexCount*3),indices=new Uint32Array(bytes,group.indexOffset,group.indexCount);
      let membership=1;if(group.tags.includes('playerclip')||group.tags.includes('npcclip'))membership=4;else if(group.tags.includes('csgo_grenadeclip'))membership=8;else if(group.tags.includes('passbullets'))membership=16;
      const collider=this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions,indices).setCollisionGroups((membership<<16)|0xffff));
      const surface=group.surface.startsWith('wood')?'wood':/metal|chainlink|computer/.test(group.surface)?'metal':/sand|dirt/.test(group.surface)?'sand':'stone';
      this.materials.set(collider.handle,surface);
      this.floorMaterials.set(collider.handle,group.surface.toLowerCase());
    }
    this.world.step();
  }
  character(position:Vec3) {
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x,position.y+.9,position.z));
    const collider=this.world.createCollider(RAPIER.ColliderDesc.capsule(.4936,.4064).setCollisionGroups(0x0002001f),body);
    this.characters.add(collider);
    return {body,collider};
  }
  spawnPoint(position:Vec3):Vec3{
    const origin={x:position.x,y:position.y+.6,z:position.z};
    const hit=this.world.castRay(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),4,true,RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC|RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,0x00020015);
    return {x:position.x,y:hit?origin.y-hit.timeOfImpact+.025:position.y,z:position.z};
  }
  move(body:RAPIER.RigidBody,collider:RAPIER.Collider,delta:Vec3) {
    this.controller.computeColliderMovement(collider,delta,RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,0x00020017);
    const d=this.controller.computedMovement(),p=body.translation();
    this.pawnContact=null;
    // Kinematic sweeps see current poses. Reserve earlier pawns' next poses too, so two
    // approaching players cannot both claim the same empty space within a simulation tick.
    const own=collider.shape as RAPIER.Capsule;
    for(const other of this.characters){
      if(!other.isValid()){this.characters.delete(other);continue;}if(other===collider||!other.isEnabled())continue;
      const q=other.parent()!.nextTranslation(),shape=other.shape as RAPIER.Capsule;
      const gap=Math.max(0,Math.abs(p.y+d.y-q.y)-own.halfHeight-shape.halfHeight),radius=own.radius+shape.radius+.015;
      if(gap>=radius)continue;const r2=radius*radius-gap*gap,x=p.x-q.x,z=p.z-q.z,a=d.x*d.x+d.z*d.z,b=x*d.x+z*d.z,c=x*x+z*z-r2;
      if(a<1e-12||b>=0)continue;const disc=b*b-a*c;if(disc<0)continue;const t=c<=0?0:(-b-Math.sqrt(disc))/a;
      if(t>=0&&t<1){d.x*=Math.max(0,t-.001);d.z*=Math.max(0,t-.001);const nx=p.x+d.x-q.x,nz=p.z+d.z-q.z,len=Math.hypot(nx,nz);if(len>1e-6)this.pawnContact={x:nx/len,y:0,z:nz/len};}
    }
    this.movement.set(d.x,d.y,d.z);
    body.setNextKinematicTranslation({x:p.x+d.x,y:p.y+d.y,z:p.z+d.z});
    return this.controller.computedGrounded();
  }
  resize(collider:RAPIER.Collider,crouched:boolean) { const radius=.4064;collider.setShape(new RAPIER.Capsule((crouched?.625:.9)-radius,radius)); }
  clipVelocity(velocity:Vec3){
    // Rapier resolves position; the FPS controller must also discard momentum into walls/ceilings.
    for(let i=0;i<this.controller.numComputedCollisions();i++){
      const n=this.controller.computedCollision(i)!.normal1;
      if(n.y>.65)continue;const inward=velocity.x*n.x+velocity.y*n.y+velocity.z*n.z;
      if(inward<0){velocity.x-=n.x*inward;velocity.y-=n.y*inward;velocity.z-=n.z*inward;}
    }
    if(this.pawnContact){const n=this.pawnContact,inward=velocity.x*n.x+velocity.z*n.z;if(inward<0){velocity.x-=n.x*inward;velocity.z-=n.z*inward;}}
  }
  groundSurface(position:Vec3){
    // Ignore invisible player clips: footsteps use the visible supporting material underneath.
    const hit=this.ray({x:position.x,y:position.y+.2,z:position.z},{x:0,y:-1,z:0},.9);
    return hit?this.floorMaterials.get(hit.collider.handle)??this.materials.get(hit.collider.handle)??'concrete':'concrete';
  }
  ray(origin:Vec3,direction:Vec3,length:number,skip?:number,grenade=false) {
    return this.world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),length,true,RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC|RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,grenade?0x00080019:0x00010001,undefined,undefined,c=>c.handle!==skip);
  }
  canSee(a:Vec3,b:Vec3) {
    const delta=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),d=delta.length();
    return d<.001||!this.ray(a,delta.multiplyScalar(1/d),Math.max(0,d-.25));
  }
  grenadeCollision(actors:()=>{id:number;collider:RAPIER.Collider}[]):GrenadeCollision{
    return{
      sweep:(origin,delta,radius,ignoreOwner)=>{
        if(this.grenadeHull.radius!==radius)this.grenadeHull=new RAPIER.Ball(radius);
        const pawns=actors(),owner=pawns.find(a=>a.id===ignoreOwner);
        const hit=this.world.castShape(origin,{x:0,y:0,z:0,w:1},delta,this.grenadeHull,0,1,true,RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,0x0008001b,owner?.collider);
        return hit?{fraction:hit.time_of_impact,normal:hit.normal1,surface:this.materials.get(hit.collider.handle)??'flesh',actor:pawns.find(a=>a.collider.handle===hit.collider.handle)?.id}:null;
      },
      visible:(a,b)=>{const delta=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),length=delta.length();return length<.002||!this.ray(a,delta.multiplyScalar(1/length),Math.max(0,length-.005));},
      ground:(origin,depth)=>{const hit=this.ray(origin,{x:0,y:-1,z:0},depth,undefined,true);return hit?{position:{x:origin.x,y:origin.y-hit.timeOfImpact,z:origin.z},normal:hit.normal}:null;},
    };
  }
}
