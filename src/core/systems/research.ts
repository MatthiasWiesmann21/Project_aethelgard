import type { Era, Modifiers } from '../../types/game'
import type { TechNode } from '../../types/research'
import {
  ERA_ADVANCE_THRESHOLD,
  ERA_ORDER,
  TECHS,
} from '../../data/techs'

export function baseModifiers(): Modifiers {
  return {
    yieldMultiplier: { food: 1, wood: 1, stone: 1, iron: 1 },
    goldYieldMultiplier: 1,
    popGrowthMultiplier: 1,
    scienceMultiplier: 1,
    claimCostMultiplier: 1,
    armyMultiplier: 1,
    extraBuildingSlots: 0,
    garrisonBonus: 0,
    unitMoveBonus: 0,
    unlockedBuildings: [],
    unlockedUnits: [],
  }
}

/** Fold every completed tech's effects into one Modifiers object. */
export function computeModifiers(completed: readonly string[]): Modifiers {
  const mods = baseModifiers()
  for (const id of completed) {
    const tech = TECHS[id]
    if (!tech) continue
    for (const e of tech.effects) {
      switch (e.kind) {
        case 'yieldBonus':
          if (e.good === 'all') {
            mods.yieldMultiplier.food *= e.multiplier
            mods.yieldMultiplier.wood *= e.multiplier
            mods.yieldMultiplier.stone *= e.multiplier
            mods.yieldMultiplier.iron *= e.multiplier
          } else {
            mods.yieldMultiplier[e.good] *= e.multiplier
          }
          break
        case 'goldYieldBonus':
          mods.goldYieldMultiplier *= e.multiplier
          break
        case 'unlockBuilding':
          if (!mods.unlockedBuildings.includes(e.building)) {
            mods.unlockedBuildings.push(e.building)
          }
          break
        case 'claimCostMultiplier':
          mods.claimCostMultiplier *= e.multiplier
          break
        case 'armyStrengthMultiplier':
          mods.armyMultiplier *= e.multiplier
          break
        case 'garrisonBonus':
          mods.garrisonBonus += e.amount
          break
        case 'unlockUnit':
          if (!mods.unlockedUnits.includes(e.unit)) {
            mods.unlockedUnits.push(e.unit)
          }
          break
        case 'popGrowthMultiplier':
          mods.popGrowthMultiplier *= e.multiplier
          break
        case 'scienceMultiplier':
          mods.scienceMultiplier *= e.multiplier
          break
        case 'buildingSlots':
          mods.extraBuildingSlots += e.amount
          break
        case 'unitMoveBonus':
          mods.unitMoveBonus += e.amount
          break
      }
    }
  }
  return mods
}

export interface ResearchTickResult {
  activeId: string | null
  progress: number
  completed: string[]
  queue: string[]
  /** All techs completed this tick (queue can chain). */
  justCompleted: TechNode[]
}

export function computeResearchTick(
  activeId: string | null,
  progress: number,
  completed: readonly string[],
  scienceGain: number,
  queue: readonly string[] = [],
): ResearchTickResult {
  const done = [...completed]
  const nextQueue = [...queue]
  const justCompleted: TechNode[] = []
  let active = activeId
  let prog = progress
  let gain = scienceGain

  // Leftover science carries into queued techs — big labs can chain.
  while (active && gain > 0) {
    const tech = TECHS[active]
    if (!tech) {
      active = null
      prog = 0
      break
    }
    prog += gain
    if (prog >= tech.cost) {
      done.push(active)
      justCompleted.push(tech)
      gain = prog - tech.cost
      prog = 0
      active = nextQueue.shift() ?? null
    } else {
      gain = 0
    }
  }
  if (!active) prog = 0

  return {
    activeId: active,
    progress: prog,
    completed: done,
    queue: nextQueue,
    justCompleted,
  }
}

/** Drop queued techs whose prerequisites are no longer completed, active, or
 * queued ahead of them (e.g. after a prerequisite was removed from the queue). */
export function pruneQueue(
  queue: readonly string[],
  completed: readonly string[],
  activeId: string | null,
): string[] {
  const kept: string[] = []
  for (const id of queue) {
    const tech = TECHS[id]
    if (!tech) continue
    const ok = tech.prerequisites.every(
      (p) => completed.includes(p) || p === activeId || kept.includes(p),
    )
    if (ok) kept.push(id)
  }
  return kept
}

export function eraIndex(era: Era): number {
  return ERA_ORDER.indexOf(era)
}

/** Advance one era once the threshold of current-era techs is completed. */
export function advanceEra(current: Era, completed: readonly string[]): Era {
  const done = completed.filter(
    (id) => TECHS[id] && TECHS[id].era === current,
  ).length
  const idx = eraIndex(current)
  if (done >= ERA_ADVANCE_THRESHOLD && idx < ERA_ORDER.length - 1) {
    return ERA_ORDER[idx + 1]
  }
  return current
}

/** Returns null when research can start (or be queued), else a readable
 * reason. `planned` = the active tech plus queued techs ahead of this one;
 * their completion counts toward prerequisites so whole chains can be queued. */
export function researchBlockReason(
  tech: TechNode,
  completed: readonly string[],
  era: Era,
  planned: readonly string[] = [],
): string | null {
  if (completed.includes(tech.id)) return 'Already researched'
  if (eraIndex(era) < eraIndex(tech.era)) {
    return `Requires ${tech.era} era`
  }
  const missing = tech.prerequisites.filter(
    (p) => !completed.includes(p) && !planned.includes(p),
  )
  if (missing.length) {
    return `Requires ${missing.map((p) => TECHS[p]?.name ?? p).join(', ')}`
  }
  return null
}
