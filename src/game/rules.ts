import type { Combatant, MatchState, Side, Team, WeaponId } from './types';
import { createWeapon, WEAPONS } from './weapons';

export const RULES = { freeze: 15, live: 115, bomb: 40, plant: 3.2, defuse: 10, kitDefuse: 5, end: 6, maxMoney: 16000 };
export function newMatch(side: Side = 'CT'): MatchState {
  return { phase: 'freeze', round: 1, score: [0, 0], sides: [side, side === 'CT' ? 'T' : 'CT'], remaining: RULES.freeze,
    bomb: freshBomb(), winner: null, reason: '', lossStreak: [0, 0] };
}
export function freshBomb(): MatchState['bomb'] {
  return { carrier: null, position: null, site: null, plantedAt: null, remaining: RULES.bomb, interaction: 0, interactingActor: null };
}
export function teamForSide(state: MatchState, side: Side): Team { return state.sides[0] === side ? 0 : 1; }
export function checkWin(state: MatchState, actors: Combatant[]): { winner: Team; reason: string } | null {
  if (state.phase !== 'live' && state.phase !== 'planted') return null;
  const t = teamForSide(state, 'T'), ct = teamForSide(state, 'CT');
  const aliveT = actors.some(a => a.team === t && a.alive), aliveCT = actors.some(a => a.team === ct && a.alive);
  if (state.phase === 'planted') {
    if (state.bomb.remaining <= 0) return { winner: t, reason: '炸弹已引爆' };
    if (!aliveCT) return { winner: t, reason: '反恐精英已被消灭' };
    return null; // A planted bomb remains live after the last attacker dies.
  }
  if (!aliveT) return { winner: ct, reason: '进攻方已被消灭' };
  if (!aliveCT) return { winner: t, reason: '防守方已被消灭' };
  if (state.remaining <= 0) return { winner: ct, reason: '回合时间结束' };
  return null;
}
export function endRound(state: MatchState, winner: Team, reason: string, actors: Combatant[]) {
  if (state.phase === 'end' || state.phase === 'finished') return;
  state.score[winner]++;
  state.winner = winner; state.reason = reason; state.phase = 'end'; state.remaining = RULES.end;
  const loser = (1 - winner) as Team;
  state.lossStreak[winner] = 0;
  const lossReward = Math.min(3400, 1400 + state.lossStreak[loser] * 500);
  state.lossStreak[loser]++;
  for (const actor of actors) actor.money = Math.min(RULES.maxMoney, actor.money + (actor.team === winner ? 3250 : lossReward));
}
export function nextRound(state: MatchState): 'next' | 'halftime' | 'finished' {
  if (Math.max(...state.score) >= 13 || state.round >= 24) { state.phase = 'finished'; return 'finished'; }
  const halftime = state.round === 12;
  state.round++;
  if (halftime) { state.sides.reverse(); state.lossStreak = [0, 0]; }
  state.phase = 'freeze'; state.remaining = RULES.freeze; state.bomb = freshBomb(); state.winner = null;
  return halftime ? 'halftime' : 'next';
}
export function canBuy(state: MatchState, actor: Combatant, inBuyZone: boolean) {
  return actor.alive && state.phase === 'freeze' && inBuyZone;
}
export function purchase(state: MatchState, actor: Combatant, item: WeaponId | 'armor' | 'helmet' | 'kit', inBuyZone: boolean): boolean {
  if (!canBuy(state, actor, inBuyZone)) return false;
  const side = state.sides[actor.team];
  if (item === 'armor' || item === 'helmet' || item === 'kit') {
    const cost = item === 'armor' ? 650 : item === 'helmet' ? 1000 : 400;
    if (actor.money < cost || (item === 'kit' && (side !== 'CT' || actor.kit)) || (item === 'armor' && actor.armor === 100) || (item === 'helmet' && actor.armor === 100 && actor.helmet)) return false;
    actor.money -= cost;
    if (item === 'kit') actor.kit = true;
    else { actor.armor = 100; if (item === 'helmet') actor.helmet = true; }
    return true;
  }
  const definition = WEAPONS[item];
  if (item === 'knife' || actor.money < definition.price || (definition.side && definition.side !== side) || actor.inventory.some(w => w.id === item)) return false;
  actor.money -= definition.price;
  actor.inventory = actor.inventory.filter(w => WEAPONS[w.id].slot !== definition.slot);
  actor.inventory.unshift(createWeapon(item));
  return true;
}
