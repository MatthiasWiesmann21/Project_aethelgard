import type { GoodId, Region } from '../../types/game'
import type { Stockpile } from './economy'
import { isLand } from '../../data/terrain'
import { mulberry32 } from './world'

/** Ticks between tribe activity rounds (~2 game years at monthly ticks). */
export const TRIBE_INTERVAL = 24
/** Chance a tribe expands into a free neighbor each round. */
export const TRIBE_EXPAND_CHANCE = 0.45
/** Chance a tribe raids a player border region when it can't expand. */
export const TRIBE_RAID_CHANCE = 0.5
/** Share of the parent's garrison the new settlement starts with. */
export const TRIBE_GARRISON_SPLIT = 0.55
export const TRIBE_GARRISON_MIN = 4
/** Tribes only found new camps when strong enough — no garrison-1 husks. */
export const TRIBE_EXPAND_MIN_GARRISON = TRIBE_GARRISON_MIN * 2
/** Garrisons slowly regrow each round, up to a cap. */
export const TRIBE_REGROWTH = 1
export const TRIBE_GARRISON_CAP = 25
/** Raiders steal goods when the border region's defense is weaker than this
 * fraction of the raiding garrison — otherwise they're repelled. */
export const RAID_REPULSE_RATIO = 0.6
export const RAID_GARRISON_LOSS = 3
export const RAID_LOOT: Partial<Record<GoodId, number>> = {
  food: 12,
  wood: 8,
}

export interface TribeContext {
  /** Tech garrison bonus applied to every player region. */
  garrisonBonus: number
  /** regionId → combined strength of player units stationed there. Regions
   * listed here are occupied and can't be seized by expanding tribes. */
  unitStrength: Record<string, number>
}

export interface TribeResult {
  /** Region record with tribe changes applied. */
  regions: Record<string, Region>
  /** Goods taken from the player's stockpile. */
  stolen: Partial<Record<GoodId, number>>
  messages: string[]
}

/**
 * Hostile neutral tribes act every TRIBE_INTERVAL ticks: garrisons regrow,
 * then each tribe expands into adjacent free (unoccupied) land or raids a
 * bordering player region. Defense = garrison + tech bonus + stationed units;
 * strong defenses repel raids and weaken the tribe. Deterministic per
 * (seed, tick).
 */
export function tribeTick(
  regions: Record<string, Region>,
  seed: number,
  tick: number,
  ctx: TribeContext = { garrisonBonus: 0, unitStrength: {} },
): TribeResult | null {
  if (tick === 0 || tick % TRIBE_INTERVAL !== 0) return null
  const rand = mulberry32(seed ^ (tick * 31337))
  const next = { ...regions }
  const messages: string[] = []
  const stolen: Partial<Record<GoodId, number>> = {}
  const tribes = Object.values(regions).filter((r) => r.hostile)

  for (const r of tribes) {
    next[r.id] = {
      ...r,
      garrison: Math.min(TRIBE_GARRISON_CAP, r.garrison + TRIBE_REGROWTH),
    }
  }

  for (const { id } of tribes) {
    const r = next[id]
    const freeNeighbors = r.neighborIds.filter((nid) => {
      const n = next[nid]
      return (
        n &&
        isLand(n.terrain) &&
        n.ownerId === null &&
        !n.hostile &&
        !(nid in ctx.unitStrength)
      )
    })
    const raidTargets = r.neighborIds.filter(
      (nid) => next[nid]?.ownerId === 'player',
    )

    if (
      freeNeighbors.length > 0 &&
      r.garrison >= TRIBE_EXPAND_MIN_GARRISON &&
      rand() < TRIBE_EXPAND_CHANCE
    ) {
      const tid = freeNeighbors[Math.floor(rand() * freeNeighbors.length)]
      const target = next[tid]
      const childGarrison = Math.max(
        TRIBE_GARRISON_MIN,
        Math.round(r.garrison * TRIBE_GARRISON_SPLIT),
      )
      next[id] = { ...r, garrison: Math.max(1, r.garrison - childGarrison) }
      next[tid] = {
        ...target,
        hostile: true,
        garrison: childGarrison,
        population: 0,
      }
      if (target.explored) {
        messages.push(`Warriors from ${r.name} seized ${target.name}!`)
      }
    } else if (raidTargets.length > 0 && rand() < TRIBE_RAID_CHANCE) {
      const tid = raidTargets[Math.floor(rand() * raidTargets.length)]
      const target = next[tid]
      const defense =
        target.garrison + ctx.garrisonBonus + (ctx.unitStrength[tid] ?? 0)
      if (defense >= r.garrison * RAID_REPULSE_RATIO) {
        next[id] = {
          ...r,
          garrison: Math.max(1, r.garrison - RAID_GARRISON_LOSS),
        }
        messages.push(`Raiders from ${r.name} were repelled at ${target.name}.`)
      } else {
        for (const [g, amount] of Object.entries(RAID_LOOT)) {
          const gid = g as GoodId
          stolen[gid] = (stolen[gid] ?? 0) + amount
        }
        messages.push(`Raiders from ${r.name} plundered ${target.name}!`)
      }
    }
  }

  return { regions: next, stolen, messages }
}

/** Subtract stolen goods from a stockpile (clamped at 0). */
export function applyRaidLoot(
  stockpile: Stockpile,
  stolen: Partial<Record<GoodId, number>>,
): Stockpile {
  const next = { ...stockpile }
  for (const [g, amount] of Object.entries(stolen)) {
    const id = g as GoodId
    next[id] = Math.max(0, next[id] - (amount ?? 0))
  }
  return next
}
