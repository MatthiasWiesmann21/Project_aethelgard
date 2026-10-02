import { describe, expect, it } from 'vitest'
import { attackOdds, resolveAttack, trainBlockReason } from './military'
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
    army: 0,
    ...overrides,
  }
}

describe('trainBlockReason', () => {
  const rich = { stockpile: { ...emptyStockpile(), iron: 10 }, gold: 50 }

  it('requires a barracks', () => {
    const r = makeRegion()
    expect(trainBlockReason(r, rich.stockpile, rich.gold)).toMatch(/Barracks/)
  })

  it('requires resources and population', () => {
    const r = makeRegion({ buildings: [{ id: 'barracks', level: 1 }] })
    expect(trainBlockReason(r, emptyStockpile(), 50)).toMatch(/iron/i)
    expect(trainBlockReason(r, rich.stockpile, 0)).toMatch(/gold/i)
    expect(
      trainBlockReason(
        makeRegion({ buildings: [{ id: 'barracks', level: 1 }], population: 1 }),
        rich.stockpile,
        rich.gold,
      ),
    ).toMatch(/population/i)
    expect(trainBlockReason(r, rich.stockpile, rich.gold)).toBeNull()
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
})
