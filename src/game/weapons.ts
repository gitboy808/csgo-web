import type { WeaponDefinition, WeaponId, WeaponState } from './types';
import{armorProtects,type HitGroup}from'./hit-feedback';

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  ak47: { id: 'ak47', name: 'AK-47', label: '突击步枪', slot: 1, price: 2700, damage: 36, armorPenetration: .775, interval: .1, magazine: 30, reserve: 90, reload: 2.45, spread: .003, recoil: .027, automatic: true, side: 'T' },
  m4a1: { id: 'm4a1', name: 'M4A1-S', label: '消音突击步枪', slot: 1, price: 2900, damage: 38, armorPenetration: .7, interval: .1, magazine: 20, reserve: 80, reload: 2.7, spread: .0025, recoil: .019, automatic: true, side: 'CT' },
  awp: { id: 'awp', name: 'AWP', label: '栓动狙击步枪', slot: 1, price: 4750, damage: 115, armorPenetration: .97, interval: 1.45, magazine: 5, reserve: 30, reload: 3.6, spread: .026, recoil: .075, automatic: false },
  glock: { id: 'glock', name: 'GLOCK-18', label: '半自动手枪', slot: 2, price: 200, damage: 30, armorPenetration: .47, interval: .18, magazine: 20, reserve: 120, reload: 2.2, spread: .008, recoil: .02, automatic: false, side: 'T' },
  usp: { id: 'usp', name: 'USP-S', label: '消音手枪', slot: 2, price: 200, damage: 35, armorPenetration: .51, interval: .17, magazine: 12, reserve: 24, reload: 2.2, spread: .005, recoil: .023, automatic: false, side: 'CT' },
  deagle: { id: 'deagle', name: 'DESERT EAGLE', label: '大口径手枪', slot: 2, price: 700, damage: 53, armorPenetration: .93, interval: .3, magazine: 7, reserve: 35, reload: 2.2, spread: .005, recoil: .06, automatic: false },
  knife: { id: 'knife', name: 'M9 BAYONET', label: '战术匕首', slot: 3, price: 0, damage: 55, armorPenetration: 1, interval: .6, magazine: 1, reserve: 0, reload: 0, spread: 0, recoil: .025, automatic: false },
};
export function createWeapon(id: WeaponId): WeaponState {
  return { id, ammo: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve };
}
export function finishReload(weapon: WeaponState) {
  const transfer = Math.min(WEAPONS[weapon.id].magazine - weapon.ammo, weapon.reserve);
  weapon.ammo += transfer; weapon.reserve -= transfer;
}
export function resolveDamage(base: number, region: boolean|HitGroup, armor: number, helmet: boolean, penetration: number,headshotMultiplier=4) {
  const group=typeof region==='boolean'?(region?'head':'chest'):region;
  let damage = base * (group==='head'?headshotMultiplier:group==='stomach'?1.25:group==='leftLeg'||group==='rightLeg'?.75:1);
  let armorUsed = 0;
  if (armorProtects(group,armor,helmet)) {
    const protectedDamage = damage * penetration;
    armorUsed = Math.min(armor, (damage - protectedDamage) * .5);
    damage -= armorUsed * 2;
  }
  return { damage: Math.ceil(damage), armorUsed: Math.ceil(armorUsed) };
}
