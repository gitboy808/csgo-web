import type{Combatant,MatchState}from'./types';
/** Competitive mode's authored friendly damage coefficients (not the engine's casual defaults). */
export function teamDamageScale(attacker:Pick<Combatant,'id'|'team'>|null|undefined,target:Pick<Combatant,'id'|'team'>,kind:'bullet'|'grenade'|'other'){
 return !attacker||attacker.id===target.id||attacker.team!==target.team?1:kind==='bullet'?.33:kind==='grenade'?.85:.4;
}
export function canTakeOver(match:Pick<MatchState,'phase'>,current:Pick<Combatant,'alive'|'team'>,candidate:Pick<Combatant,'alive'|'team'|'id'>|undefined){
 return !current.alive&&(match.phase==='live'||match.phase==='planted')&&!!candidate&&candidate.alive&&candidate.team===current.team&&candidate.id!==0;
}
