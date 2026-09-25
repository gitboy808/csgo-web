import*as THREE from'three';import type{WeaponId}from'../game/types';import{makeWeapon}from'./models';import{WEAPONS}from'../game/weapons';import{bakeStaticProp}from'./static-prop';
type DroppedWeaponId=Exclude<WeaponId,'knife'>;
/** Static gun prototypes; knives cannot be dropped and need no extra ground-mesh pool. */
export class DroppedModels{
 private prototypes=new Map<DroppedWeaponId,THREE.Group>();private pool=new Map<DroppedWeaponId,THREE.Group[]>();
 constructor(){for(const id of Object.keys(WEAPONS)as WeaponId[]){if(id==='knife')continue;const gun=makeWeapon(id);gun.animation?.update(0);const model=bakeStaticProp(gun.root);gun.animation?.dispose();this.prototypes.set(id,model);this.pool.set(id,Array.from({length:3},()=>model.clone(true)));}}
 take(id:DroppedWeaponId){const model=this.pool.get(id)!.pop()??this.prototypes.get(id)!.clone(true);model.userData.droppedWeapon=id;model.position.set(0,0,0);model.rotation.set(0,0,0);model.scale.setScalar(1);model.visible=true;return model;}
 release(model:THREE.Group){model.removeFromParent();model.visible=false;const pool=this.pool.get(model.userData.droppedWeapon);if(pool&&pool.length<8)pool.push(model);}
 prewarmModels(){return [...this.prototypes.values()];}
 get stats(){return{types:this.prototypes.size,pooled:[...this.pool.values()].reduce((n,p)=>n+p.length,0),skinned:false};}
}
