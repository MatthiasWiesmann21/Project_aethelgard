import { describe, expect, it } from 'vitest'
import {
  applyRaidLoot,
  TRIBE_EXPAND_MIN_GARRISON,
  TRIBE_GARRISON_CAP,
  TRIBE_INTERVAL,
  TRIBE_REGROWTH,
  tribeTick,
} from './tribes'
import { emptyStockpile } from './economy'
import type { Region } from '../../types/game'

function makeRegion(overrides: Partial<Region> = {}): Region {
  return {
    id: 'r0',
    name: 'Test',
    polygon: [],
    centroid: { x: 0, y: 0 },
    terrain: 'plains',
    neighborIds: [],
    ownerId: null,
    hostile: false,
    explored: true,
    isCapital: false,
    population: 0,
    buildings: [],
    construction: null,
    deposit: null,
    garrison: 0,
    ...overrides,
  }
}

/** hostile r0 between free land r1 and player-owned r2. */
function makeWorld() {
  const regions: Record<string, Region> = {
    r0: makeRegion({ id: 'r0', hostile: true, garrison: 20, neighborIds: ['r1', 'r2'] }),
    r1: makeRegion({ id: 'r1', neighborIds: ['r0'] }),
    r2: makeRegion({ id: 'r2', ownerId: 'player', population: 5, neighborIds: ['r0'] }),
  }
  return regions
}

describe('tribeTick', () => {
  it('is inactive off the interval', () => {
    expect(tribeTick(makeWorld(), 1, 5)).toBeNull()
    expect(tribeTick(makeWorld(), 1, 0)).toBeNull()
  })

  it('is deterministic for the same seed and tick', () => {
    const a = tribeTick(makeWorld(), 7, TRIBE_INTERVAL)
    const b = tribeTick(makeWorld(), 7, TRIBE_INTERVAL)
    expect(a).toEqual(b)
  })

  it('expands or raids — never leaves the world untouched forever', () => {
    let acted = 0
    for (let t = TRIBE_INTERVAL; t <= TRIBE_INTERVAL * 20; t += TRIBE_INTERVAL) {
      const res = tribeTick(makeWorld(), 3, t)
      if (res && res.messages.length > 0) acted++
    }
    expect(acted).toBeGreaterThan(0)
  })

  it('expansion makes a neighbor hostile and splits the garrison', () => {
    // Find a tick where expansion happens.
    for (let t = TRIBE_INTERVAL; t <= TRIBE_INTERVAL * 30; t += TRIBE_INTERVAL) {
      const res = tribeTick(makeWorld(), 11, t)
      if (res && res.regions.r1.hostile) {
        expect(res.regions.r1.garrison).toBeGreaterThanOrEqual(4)
        expect(res.regions.r0.garrison).toBeLessThan(20)
        return
      }
    }
    throw new Error('no expansion observed in 30 rounds')
  })

  it('raids steal loot from undefended borders', () => {
    for (let t = TRIBE_INTERVAL; t <= TRIBE_INTERVAL * 40; t += TRIBE_INTERVAL) {
      const res = tribeTick(makeWorld(), 5, t)
      if (res && Object.keys(res.stolen).length > 0) {
        expect(res.stolen.food ?? 0).toBeGreaterThan(0)
        return
      }
    }
    throw new Error('no raid observed in 40 rounds')
  })

  it('strong defenses repel raids and weaken the tribe', () => {
    const world = makeWorld()
    world.r2 = { ...world.r2, garrison: 50 } // way above repulse ratio
    // Remove expansion option so raids are the only choice.
    world.r1 = { ...world.r1, hostile: true, garrison: 5 }
    for (let t = TRIBE_INTERVAL; t <= TRIBE_INTERVAL * 40; t += TRIBE_INTERVAL) {
      const res = tribeTick(world, 9, t)
      if (res && res.messages.some((m) => m.includes('repelled'))) {
        expect(res.regions.r0.garrison).toBeLessThan(20)
        return
      }
    }
    throw new Error('no repelled raid observed in 40 rounds')
  })
})

describe('tribeTick defense & expansion rules', () => {
  /** r0 hostile; its only neighbor is player-owned r2 → raids are the only option. */
  function raidWorld(garrison: number) {
    return {
      r0: makeRegion({ id: 'r0', hostile: true, garrison, neighborIds: ['r2'] }),
      r2: makeRegion({ id: 'r2', ownerId: 'player', population: 5, neighborIds: ['r0'] }),
    }
  }

  function firstRaid(
    world: Record<string, Region>,
    ctx: Parameters<typeof tribeTick>[3],
  ) {
    for (let t = TRIBE_INTERVAL; t <= TRIBE_INTERVAL * 60; t += TRIBE_INTERVAL) {
      const res = tribeTick(world, 13, t, ctx)
      if (res && res.messages.length) return res
    }
    throw new Error('no raid in 60 rounds')
  }

  it('tech garrison bonus repels raids that would otherwise plunder', () => {
    // garrison 20 regrows to 21 → needs defense ≥ 12.6
    const undefended = firstRaid(raidWorld(20), { garrisonBonus: 0, unitStrength: {} })
    expect(undefended.messages[0]).toMatch(/plundered/)
    const fortified = firstRaid(raidWorld(20), { garrisonBonus: 15, unitStrength: {} })
    expect(fortified.messages[0]).toMatch(/repelled/)
  })

  it('stationed units help defend', () => {
    const res = firstRaid(raidWorld(20), { garrisonBonus: 0, unitStrength: { r2: 20 } })
    expect(res.messages[0]).toMatch(/repelled/)
  })

  it('never expands into a region occupied by player units', () => {
    for (let t = TRIBE_INTERVAL; t <= TRIBE_INTERVAL * 30; t += TRIBE_INTERVAL) {
      const res = tribeTick(makeWorld(), 11, t, { garrisonBonus: 0, unitStrength: { r1: 6 } })
      expect(res?.regions.r1.hostile).toBe(false)
    }
  })

  it('weak tribes do not expand (no garrison-1 husks)', () => {
    const world = makeWorld()
    world.r0 = { ...world.r0, garrison: TRIBE_EXPAND_MIN_GARRISON - 2 }
    for (let t = TRIBE_INTERVAL; t <= TRIBE_INTERVAL * 30; t += TRIBE_INTERVAL) {
      expect(tribeTick(world, 11, t)?.regions.r1.hostile).toBe(false)
    }
  })

  it('garrisons regrow each round up to the cap', () => {
    const lonely = {
      r0: makeRegion({ id: 'r0', hostile: true, garrison: 5, neighborIds: [] }),
      r9: makeRegion({ id: 'r9', hostile: true, garrison: TRIBE_GARRISON_CAP, neighborIds: [] }),
    }
    const res = tribeTick(lonely, 1, TRIBE_INTERVAL)!
    expect(res.regions.r0.garrison).toBe(5 + TRIBE_REGROWTH)
    expect(res.regions.r9.garrison).toBe(TRIBE_GARRISON_CAP)
  })
})

describe('applyRaidLoot', () => {
  it('subtracts goods without going negative', () => {
    const stock = { ...emptyStockpile(), food: 5, wood: 20 }
    const next = applyRaidLoot(stock, { food: 12, wood: 8 })
    expect(next.food).toBe(0)
    expect(next.wood).toBe(12)
  })
})
