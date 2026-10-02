import type { Modifiers, Region } from '../../types/game'
import type { Stockpile } from './economy'

export const ARMY_PER_TRAIN = 8
export const TRAIN_POP_COST = 1
export const TRAIN_IRON_COST = 5
export const TRAIN_GOLD_COST = 10
/** Defenders get a home-ground bonus. */
export const DEFENDER_ADVANTAGE = 1.25
/** Random combat roll range: attacker power varies ±10%... kept small so
 * overwhelming force is reliable. */
export const ATTACK_VARIANCE = 0.15
/** Units regain this much strength per tick inside friendly territory. */
export const HEAL_PER_TICK = 2

export function regionHasBarracks(region: Region): boolean {
  return region.buildings.some((b) => b.id === 'barracks')
}

/** Null when an army can be trained here, else a human-readable reason. */
export function trainBlockReason(
  region: Region,
  stockpile: Stockpile,
  gold: number,
): string | null {
  if (region.ownerId !== 'player') return 'Not your region'
  if (!regionHasBarracks(region)) return 'Requires a Barracks'
  if (region.population <= TRAIN_POP_COST) return 'Not enough population'
  if (stockpile.iron < TRAIN_IRON_COST) return 'Not enough iron'
  if (gold < TRAIN_GOLD_COST) return 'Not enough gold'
  return null
}

export interface AttackResult {
  victory: boolean
  remainingArmy: number
  remainingGarrison: number
}

/**
 * Instant combat resolution. Attacker power = army × roll × tech multiplier;
 * defender = garrison × DEFENDER_ADVANTAGE. The loser is destroyed; the winner
 * keeps strength reduced proportionally to the enemy's power.
 */
export function resolveAttack(
  army: number,
  garrison: number,
  roll: number,
  modifiers: Modifiers,
): AttackResult {
  const attack = army * (1 - ATTACK_VARIANCE + roll * ATTACK_VARIANCE * 2) * modifiers.armyMultiplier
  const defense = garrison * DEFENDER_ADVANTAGE

  if (attack > defense) {
    return {
      victory: true,
      remainingArmy: Math.max(1, Math.round(army * (1 - (defense / attack) * 0.5))),
      remainingGarrison: 0,
    }
  }
  return {
    victory: false,
    remainingArmy: 0,
    remainingGarrison: Math.max(
      1,
      Math.round(garrison * (1 - (attack / defense) * 0.5)),
    ),
  }
}

export type AttackOdds = 'victory' | 'risky' | 'defeat'

export const ODDS_LABEL: Record<AttackOdds, string> = {
  victory: 'Victory likely',
  risky: 'Risky',
  defeat: 'Likely defeat',
}

/** Pre-combat estimate spanning the full roll range. */
export function attackOdds(
  attacker: number,
  garrison: number,
  modifiers: Modifiers,
): AttackOdds {
  const defense = garrison * DEFENDER_ADVANTAGE
  const worst = attacker * (1 - ATTACK_VARIANCE) * modifiers.armyMultiplier
  const best = attacker * (1 + ATTACK_VARIANCE) * modifiers.armyMultiplier
  if (worst > defense) return 'victory'
  if (best > defense) return 'risky'
  return 'defeat'
}
