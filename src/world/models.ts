import * as THREE from 'three';
import type { Side, WeaponId } from '../game/types';

export type WeaponAction='idle'|'draw'|'fire'|'reload'|'reloadEmpty'|'fireEmpty'|'empty'|'inspect'|'plant';
export interface WeaponAnimation {play(action:WeaponAction,duration?:number):void;update(dt:number):void;setEmpty(empty:boolean):void;pose(action:WeaponAction,time:number):void;dispose():void}
export interface WeaponModel { root:THREE.Group; magazine:THREE.Group; bolt:THREE.Group; muzzle:THREE.Group;animation?:WeaponAnimation }
export interface CharacterPose {time:number;weapon:WeaponId;velocity:THREE.Vector3;yaw:number;crouch:boolean;grounded:boolean;alive:boolean;lastFire:number;lastDamage:number;reloadUntil:number;kit:boolean;objective:'plant'|'defuse'|null;deathTime?:number;utility?:{action:string;at:number}|null}
export interface CharacterAnimation {update(dt:number,pose:CharacterPose):void;attach(weapon:WeaponModel):void;attachProp?(prop:THREE.Object3D):void;reset():void;dispose():void;readonly status:object}
export interface CharacterModel { root:THREE.Group; torso:THREE.Group; head:THREE.Group; leftLeg:THREE.Group; rightLeg:THREE.Group; weapon:WeaponModel; side:Side;animation?:CharacterAnimation }

let weaponFactory: ((id: WeaponId, firstPerson: boolean) => WeaponModel) | undefined;
let characterFactory: ((side: Side) => CharacterModel) | undefined;

export function registerNativeWeaponFactory(factory: NonNullable<typeof weaponFactory>) { weaponFactory = factory; }
export function registerNativeCharacterFactory(factory: NonNullable<typeof characterFactory>) { characterFactory = factory; }

export function makeWeapon(id: WeaponId, firstPerson = false): WeaponModel {
  if (!weaponFactory) throw new Error('原始枪械资源尚未加载');
  return weaponFactory(id, firstPerson);
}

export function makeCharacter(side: Side): CharacterModel {
  if (!characterFactory) throw new Error('原始角色资源尚未加载');
  return characterFactory(side);
}

export function equipCharacterWeapon(model: CharacterModel, id: WeaponId) {
  model.weapon.root.removeFromParent();
  model.weapon.animation?.dispose();
  model.weapon.root.traverse(o => { if (o instanceof THREE.Mesh && !o.geometry.userData.source2Shared) o.geometry.dispose(); });
  model.weapon = makeWeapon(id);
  model.animation!.attach(model.weapon);
}
