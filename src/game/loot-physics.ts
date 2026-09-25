import RAPIER from'@dimforge/rapier3d-compat';import*as THREE from'three';import type{Vec3}from'./types';
export interface LootBody{body:RAPIER.RigidBody;mesh:THREE.Group;position:THREE.Vector3;asleep:boolean}
/** Loot collides with architecture/loot, never pushes players. Sleeping objects have no transform work. */
export class LootPhysics{
 private items=new Set<LootBody>();readonly stats={spawned:0,active:0,sleeping:0,updates:0};
 constructor(private world:RAPIER.World){}
 add(mesh:THREE.Group,position:Vec3,rotation:THREE.Quaternion,velocity:Vec3,spin:Vec3={x:1.6,y:.7,z:1.2}){
  const half=mesh.userData.halfExtents as Vec3??{x:.12,y:.08,z:.12};
  const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x,position.y,position.z).setRotation(rotation).setLinvel(velocity.x,velocity.y,velocity.z).setAngvel(spin).setLinearDamping(.3).setAngularDamping(1.1).setCanSleep(true).setCcdEnabled(true));
  this.world.createCollider(RAPIER.ColliderDesc.cuboid(half.x,half.y,half.z).setMass(1.2).setFriction(.7).setRestitution(.18).setCollisionGroups(0x00200031),body);
  const item:LootBody={body,mesh,position:new THREE.Vector3().copy(position),asleep:false};mesh.position.copy(position);mesh.quaternion.copy(rotation);this.items.add(item);this.stats.spawned++;this.stats.active++;return item;
 }
 update(){let awake=0,sleeping=0;for(const item of this.items){const asleep=item.body.isSleeping();if(asleep)sleeping++;else awake++;if(asleep&&item.asleep)continue;item.asleep=asleep;item.position.copy(item.body.translation());item.mesh.position.copy(item.position);item.mesh.quaternion.copy(item.body.rotation());this.stats.updates++;}this.stats.active=awake;this.stats.sleeping=sleeping;}
 remove(item:LootBody|undefined){if(!item||!this.items.delete(item))return;if(item.asleep)this.stats.sleeping=Math.max(0,this.stats.sleeping-1);else this.stats.active=Math.max(0,this.stats.active-1);this.world.removeRigidBody(item.body);}
 clear(){for(const item of this.items)this.world.removeRigidBody(item.body);this.items.clear();this.stats.active=this.stats.sleeping=0;}
}
