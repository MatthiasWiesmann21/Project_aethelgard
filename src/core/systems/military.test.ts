import { describe, expect, it } from 'vitest'
import {
  attackOdds,
  recruitBlockReason,
  resolveAttack,
  resolveStackAttack,
  unitMoves,
} from './military'
import { baseModifiers } from './research'
import type { Region } from '../../types/game'
import { emptyStockpile } from './economy'

const mods = baseModifiers()

function makeRegion(overrides: Partial<Region> = {}): Region {
  return {
    id: 'r0',
    name: 'Test',
    polygon: [],
    centroid: { x: 0, y: 0 },
    terrain: 'plains',
    neighborIds: [],
    ownerId: 'player',
    hostile: false,
    explored: true,
    isCapital: false,
    population: 5,
    buildings: [],
    construction: null,
    deposit: null,
    garrison: 0,
    ...overrides,
  }
}

describe('recruitBlockReason', () => {
  const rich = { stockpile: { ...emptyStockpile(), iron: 10, food: 20 }, gold: 50 }
  const militia = ['warrior_code', 'militia']
  const barracks = makeRegion({ buildings: [{ id: 'barracks', level: 1 }] })

  it('soldiers need the Militia tech and a Barracks', () => {
    expect(recruitBlockReason('soldier', barracks, rich.stockpile, rich.gold, [])).toMatch(/Militia/)
    expect(recruitBlockReason('soldier', makeRegion(), rich.stockpile, rich.gold, militia)).toMatch(/Barracks/)
  })

  it('checks resources and population', () => {
    expect(recruitBlockReason('soldier', barracks, emptyStockpile(), 50, militia)).toMatch(/iron/i)
    expect(recruitBlockReason('soldier', barracks, rich.stockpile, 0, militia)).toMatch(/gold/i)
    expect(
      recruitBlockReason(
        'soldier',
        makeRegion({ buildings: [{ id: 'barracks', level: 1 }], population: 1 }),
        rich.stockpile,
        rich.gold,
        militia,
      ),
    ).toMatch(/population/i)
    expect(recruitBlockReason('soldier', barracks, rich.stockpile, rich.gold, militia)).toBeNull()
  })

  it('warriors need no tech or building', () => {
    expect(recruitBlockReason('warrior', makeRegion(), rich.stockpile, rich.gold, [])).toBeNull()
  })

  it('only owned regions can recruit', () => {
    expect(
      recruitBlockReason('warrior', makeRegion({ ownerId: null }), rich.stockpile, rich.gold, []),
    ).toMatch(/Not your region/)
  })
})

describe('resolveStackAttack', () => {
  it('combined strength can win where each unit alone would lose', () => {
    // garrison 10 → defense 12.5; 8 alone loses even at best roll (9.2)
    expect(resolveAttack(8, 10, 1, mods).victory).toBe(false)
    const res = resolveStackAttack([8, 8], 10, 0, mods)
    expect(res.victory).toBe(true)
    expect(res.survivors).toHaveLength(2)
    expect(res.survivors.every((s) => s >= 1 && s <= 8)).toBe(true)
  })

  it('loses the whole stack on defeat', () => {
    const res = resolveStackAttack([2, 2], 20, 1, mods)
    expect(res.victory).toBe(false)
    expect(res.survivors).toEqual([])
    expect(res.remainingGarrison).toBeLessThan(20)
  })
})

describe('resolveAttack', () => {
  it('overwhelming force always wins', () => {
    const res = resolveAttack(30, 10, 0, mods) // worst roll
    expect(res.victory).toBe(true)
    expect(res.remainingArmy).toBeGreaterThan(0)
    expect(res.remainingGarrison).toBe(0)
  })

  it('weak force always loses and weakens the defenders', () => {
    const res = resolveAttack(5, 20, 1, mods) // best roll still loses
    expect(res.victory).toBe(false)
    expect(res.remainingArmy).toBe(0)
    expect(res.remainingGarrison).toBeLessThan(20)
  })

  it('defender advantage matters at parity', () => {
    // army == garrison → defender wins due to DEFENDER_ADVANTAGE
    const res = resolveAttack(10, 10, 1, mods)
    expect(res.victory).toBe(false)
  })

  it('army multiplier from techs can flip a battle', () => {
    const boosted = { ...mods, armyMultiplier: 2 }
    const res = resolveAttack(10, 10, 0.5, boosted)
    expect(res.victory).toBe(true)
  })
})

describe('attackOdds', () => {
  it('overwhelming force is a certain victory', () => {
    expect(attackOdds(30, 10, mods)).toBe('victory')
  })

  it('a weak force is certain defeat', () => {
    expect(attackOdds(5, 20, mods)).toBe('defeat')
  })

  it('forces in the roll range are risky', () => {
    // defense = 10 × 1.25 = 12.5; attack 10 spans 8.5–11.5 → defeat
    expect(attackOdds(10, 10, mods)).toBe('defeat')
    // attack 12 spans 10.2–13.8 vs 12.5 → risky
    expect(attackOdds(12, 10, mods)).toBe('risky')
  })

  it('a river crossing weakens the attack', () => {
    // army 20 vs garrison 14: defense 17.5, attack 17–23 → risky
    expect(attackOdds(20, 14, mods)).toBe('risky')
    // ×0.8 river penalty → 13.6–18.4 → still risky at best
    expect(attackOdds(20, 14, mods, 0.8)).toBe('risky')
    // army 16 vs garrison 14: 13.6–18.4 risky; ×0.8 → 10.9–14.7 → defeat
    expect(attackOdds(16, 14, mods, 0.8)).toBe('defeat')
  })
})

describe('unitMoves', () => {
  const unit = { kind: 'warrior' as const }

  it('grows with era and tech bonuses', () => {
    expect(unitMoves(unit, 'ancient', mods)).toBe(1)
    expect(unitMoves(unit, 'medieval', mods)).toBe(2)
    expect(unitMoves(unit, 'renaissance', { ...mods, unitMoveBonus: 1 })).toBe(4)
  })
})
