import type{Combatant,Vec3,WeaponState}from'./types';import{WEAPONS}from'./weapons';
export function autoWeaponPickup(player:Combatant,weapon:WeaponState){return player.alive&&weapon.id!=='knife'&&!player.inventory.some(w=>WEAPONS[w.id].slot===WEAPONS[weapon.id].slot);}
export function pickupReach(player:Vec3,item:Vec3,manual=false){const dx=player.x-item.x,dz=player.z-item.z;return dx*dx+dz*dz<=(manual?2:1.05)**2&&Math.abs(player.y-item.y)<1.4;}
export function deathWeapon(player:Combatant){return player.inventory.find(w=>WEAPONS[w.id].slot===1)??player.inventory.find(w=>WEAPONS[w.id].slot===2);}
