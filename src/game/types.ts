export type Side = 'T' | 'CT';
export type Team = 0 | 1;
export type WeaponId = 'glock' | 'usp' | 'ak47' | 'm4a1' | 'awp' | 'deagle' | 'knife';
export type GrenadeId = 'he' | 'flash' | 'smoke';
export type Phase = 'warmup' | 'freeze' | 'live' | 'planted' | 'end' | 'finished';
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface Vec3 { x: number; y: number; z: number }
export interface WeaponDefinition {
  id: WeaponId; name: string; label: string; slot: 1 | 2 | 3; price: number;
  damage: number; armorPenetration: number; interval: number; magazine: number;
  reserve: number; reload: number; spread: number; recoil: number; automatic: boolean;
  side?: Side; color: number;
}
export interface WeaponState { id: WeaponId; ammo: number; reserve: number }
export interface Combatant {
  id: number; team: Team; name: string; alive: boolean; health: number; armor: number;
  helmet: boolean; kit: boolean; money: number; kills: number; deaths: number;
  inventory: WeaponState[];
}
export interface BombState {
  carrier: number | null; position: Vec3 | null; site: 'A' | 'B' | null;
  plantedAt: number | null; remaining: number; interaction: number;
  interactingActor: number | null;
}
export interface MatchState {
  phase: Phase; round: number; score: [number, number]; sides: [Side, Side];
  remaining: number; bomb: BombState; winner: Team | null; reason: string;
  lossStreak: [number, number];
}
export interface Settings {
  sensitivity: number; volume: number; quality: 'high' | 'medium' | 'low';
  crosshair: 'classic' | 'dot'; difficulty: Difficulty; side: Side;
}
