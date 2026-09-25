import type {MusicKitId} from './music-kits';
export type Side = 'T' | 'CT';
export type Team = 0 | 1;
export type WeaponId = 'glock' | 'usp' | 'ak47' | 'm4a1' | 'awp' | 'deagle' | 'knife';
export type GrenadeId = 'he' | 'flash' | 'smoke' | 'molotov' | 'incendiary' | 'decoy';
export type Phase = 'freeze' | 'live' | 'planted' | 'end' | 'finished';
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface Vec3 { x: number; y: number; z: number }
export interface WeaponDefinition {
  id: WeaponId; name: string; label: string; slot: 1 | 2 | 3; price: number;
  damage: number; armorPenetration: number; interval: number; magazine: number;
  reserve: number; reload: number; spread: number; recoil: number; automatic: boolean;
  side?: Side;
  headshotMultiplier?:number;reloadInsert?:number;native?:NativeWeaponTuning;
}
export interface NativeWeaponTuning {
  maxSpeed:number;range:number;rangeModifier:number;deploy:number;spread:number;stand:number;crouch:number;move:number;jump:number;land:number;fire:number;
  recoveryStand:number;recoveryCrouch:number;recoveryStandFinal:number;recoveryCrouchFinal:number;recoveryStart:number;recoveryEnd:number;
  recoilSeed:number;recoilAngle:number;recoilAngleVariance:number;recoilMagnitude:number;recoilMagnitudeVariance:number;
  zoomLevels:number;zoomFov:number[];unzoomAfterShot:boolean;hideWhenZoomed:boolean;
  scoped?:{spread:number;stand:number;crouch:number;move:number;maxSpeed:number};
  burst?:{cycle:number;interval:number};
}
export interface WeaponState { id: WeaponId; ammo: number; reserve: number }
export interface Combatant {
  id: number; team: Team; name: string; alive: boolean; health: number; armor: number;
  helmet: boolean; kit: boolean; money: number; kills: number; deaths: number;
  inventory: WeaponState[];
}
export interface BombState {
  carrier: number | null; position: Vec3 | null; site: 'A' | 'B' | null;
  remaining: number; interaction: number;
  interactingActor: number | null;
}
export interface MatchState {
  phase: Phase; round: number; score: [number, number]; sides: [Side, Side];
  remaining: number; bomb: BombState; winner: Team | null; reason: string;
  lossStreak: [number, number];
  mvp?:{id:number;name:string;reason:string};
}
export interface Settings {
  sensitivity: number; volume: number; quality: 'high' | 'medium' | 'low';
  crosshair: 'classic' | 'dot'; difficulty: Difficulty; side: Side;
  radioVolume:number;musicVolume:number;musicKit:MusicKitId;
  frameLimit:60|90|120;
  dynamicResolution:boolean;
}
