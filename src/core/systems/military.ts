import type { Era, Modifiers, Region, UnitKind } from '../../types/game'
import type { Stockpile } from './economy'
import { BUILDINGS } from '../../data/buildings'
import { TECHS } from '../../data/techs'
import { UNITS } from '../../data/units'
import { eraIndex } from './research'

/** Defenders get a home-ground bonus. */
export const DEFENDER_ADVANTAGE = 1.25
/** Random combat roll range: attacker power varies ±15% — kept small so
 * overwhelming force is reliable. */
export const ATTACK_VARIANCE = 0.15
/** Units regain this much strength per tick inside friendly territory. */
export const HEAL_PER_TICK = 2

/** Null when `kind` can be recruited in `region`, else a readable reason. */
export function recruitBlockReason(
  kind: UnitKind,
  region: Region,
  stockpile: Stockpile,
  gold: number,
  completed: readonly string[],
): string | null {
  const def = UNITS[kind]
  if (region.ownerId !== 'player') return 'Not your region'
  if (def.requiredTech && !completed.includes(def.requiredTech)) {
    return `Requires ${TECHS[def.requiredTech]?.name ?? def.requiredTech}`
  }
  if (
    def.requiredBuilding &&
    !region.buildings.some((b) => b.id === def.requiredBuilding)
  ) {
    return `Requires a ${BUILDINGS[def.requiredBuilding].name}`
  }
  if (def.cost.pop > 0 && region.population <= def.cost.pop) {
    return 'Not enough population'
  }
  if (stockpile.iron < def.cost.iron) return 'Not enough iron'
  if (stockpile.food < def.cost.food) return 'Not enough food'
  if (gold < def.cost.gold) return 'Not enough gold'
  return null
}

export interface AttackResult {
  victory: boolean
  remainingArmy: number
  remainingGarrison: number
}

/**
 * Instant combat resolution. Attacker power = army × roll × tech multiplier;
 * defender = garrison × DEFENDER_ADVANTAGE. `riverPenalty` (<1) weakens
 * attackers crossing a river. The loser is destroyed; the winner keeps
 * strength reduced proportionally to the enemy's power.
 */
export function resolveAttack(
  army: number,
  garrison: number,
  roll: number,
  modifiers: Modifiers,
  riverPenalty = 1,
): AttackResult {
  const attack = army * (1 - ATTACK_VARIANCE + roll * ATTACK_VARIANCE * 2) * modifiers.armyMultiplier * riverPenalty
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

export interface StackAttackResult {
  victory: boolean
  /** Surviving strength per attacking unit (same order as input); empty on defeat. */
  survivors: number[]
  remainingGarrison: number
}

/** Several units attack together with their combined strength. On victory
 * losses are shared proportionally (every survivor keeps ≥1). */
export function resolveStackAttack(
  strengths: readonly number[],
  garrison: number,
  roll: number,
  modifiers: Modifiers,
  riverPenalty = 1,
): StackAttackResult {
  const total = strengths.reduce((a, b) => a + b, 0)
  const res = resolveAttack(total, garrison, roll, modifiers, riverPenalty)
  if (!res.victory) {
    return { victory: false, survivors: [], remainingGarrison: res.remainingGarrison }
  }
  return {
    victory: true,
    survivors: strengths.map((s) =>
      Math.max(1, Math.round((s / total) * res.remainingArmy)),
    ),
    remainingGarrison: 0,
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
  riverPenalty = 1,
): AttackOdds {
  const defense = garrison * DEFENDER_ADVANTAGE
  const worst =
    attacker * (1 - ATTACK_VARIANCE) * modifiers.armyMultiplier * riverPenalty
  const best =
    attacker * (1 + ATTACK_VARIANCE) * modifiers.armyMultiplier * riverPenalty
  if (worst > defense) return 'victory'
  if (best > defense) return 'risky'
  return 'defeat'
}

/** Max move points per tick: unit base + 1 per era + tech bonus — units get
 * faster as civilization advances. */
export function unitMoves(
  unit: { kind: UnitKind },
  era: Era,
  modifiers: Modifiers,
): number {
  return UNITS[unit.kind].moves + eraIndex(era) + modifiers.unitMoveBonus
}
