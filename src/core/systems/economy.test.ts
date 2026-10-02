import { describe, expect, it } from 'vitest'
import {
  computeEconomyTick,
  emptyStockpile,
  initialMarket,
  regionCapacity,
  regionOutput,
} from './economy'
import { baseModifiers } from './research'
import type { Region } from '../../types/game'

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
    buildings: [{ id: 'farm', level: 1 }],
    construction: null,
    deposit: null,
    garrison: 0,
    army: 0,
    ...overrides,
  }
}

const mods = baseModifiers()

describe('regionOutput', () => {
  it('sums terrain bonus and building yields', () => {
    const r = makeRegion({ terrain: 'plains', buildings: [{ id: 'farm', level: 1 }] })
    const out = regionOutput(r, mods)
    expect(out.goods.food).toBe(4) // 1 plains + 3 farm
  })

  it('applies yield multiplier modifiers', () => {
    const r = makeRegion()
    const boosted = {
      ...mods,
      yieldMultiplier: { ...mods.yieldMultiplier, food: 2 },
    }
    expect(regionOutput(r, boosted).goods.food).toBe(8)
  })

  it('scales with building level', () => {
    const r = makeRegion({ buildings: [{ id: 'farm', level: 3 }] })
    expect(regionOutput(r, mods).goods.food).toBe(1 + 3 * 3)
  })

  it('is throttled when understaffed', () => {
    // farm needs 3 workers; only 1.5 pop → 50% staffing on building yield
    const r = makeRegion({ population: 1.5 })
    expect(regionOutput(r, mods).goods.food).toBe(1 + 3 * 0.5)
  })

  it('adds deposit yield without needing workers', () => {
    const r = makeRegion({ buildings: [], deposit: 'fertile_soil', population: 0 })
    expect(regionOutput(r, mods).goods.food).toBe(1 + 2)
  })
})

describe('computeEconomyTick', () => {
  it('produces goods, collects taxes, and grows population', () => {
    const regions = { r0: makeRegion({ population: 10 }) }
    const res = computeEconomyTick(
      regions,
      initialMarket(),
      emptyStockpile(),
      emptyStockpile(),
      mods,
    )
    // food: 3 farm + 1 plains + 1.5 subsistence − 2 consumption = 3.5
    expect(res.goodsDelta.food).toBeCloseTo(3.5)
    // taxes: 10 pop × 0.25
    expect(res.goldDelta).toBeCloseTo(2.5)
    expect(res.population.r0).toBeGreaterThan(10)
  })

  it('always produces subsistence food', () => {
    const regions = { r0: makeRegion({ buildings: [], population: 10 }) }
    const res = computeEconomyTick(
      regions,
      initialMarket(),
      emptyStockpile(),
      emptyStockpile(),
      mods,
    )
    // 1 plains + 1.5 subsistence − 2 consumption = +0.5
    expect(res.goodsDelta.food).toBeCloseTo(0.5)
  })

  it('halts growth on food shortage without killing population', () => {
    const regions = {
      r0: makeRegion({
        terrain: 'mountain',
        buildings: [],
        population: 20,
      }),
    }
    const res = computeEconomyTick(
      regions,
      initialMarket(),
      emptyStockpile(),
      emptyStockpile(), // empty stockpile → deficit
      mods,
    )
    // mountain gives no food; 3 subsistence < 4 need → shortage
    expect(res.starving).toBe(true)
    expect(res.population.r0).toBe(20)
  })

  it('raises prices when demand exceeds supply', () => {
    const regions = { r0: makeRegion() }
    const market = initialMarket()
    const buyPressure = { ...emptyStockpile(), wood: 50 }
    const res = computeEconomyTick(
      regions,
      market,
      buyPressure,
      emptyStockpile(),
      mods,
    )
    expect(res.market.wood.price).toBeGreaterThan(market.wood.basePrice)
  })

  it('decays trade pressure each tick', () => {
    const regions = { r0: makeRegion() }
    const pressure = { ...emptyStockpile(), food: 10 }
    const res = computeEconomyTick(
      regions,
      initialMarket(),
      pressure,
      emptyStockpile(),
      mods,
    )
    expect(res.tradePressure.food).toBeCloseTo(8)
  })

  it('caps population at housing capacity', () => {
    // plains capacity is 20 — a region at cap stays at cap.
    const regions = {
      r0: makeRegion({ population: 20 }),
    }
    const res = computeEconomyTick(
      regions,
      initialMarket(),
      emptyStockpile(),
      { ...emptyStockpile(), food: 100 }, // well-fed
      mods,
    )
    expect(res.population.r0).toBe(20)
  })

  it('granary raises the housing cap', () => {
    const base = makeRegion()
    const withGranary = makeRegion({
      buildings: [
        { id: 'farm', level: 1 },
        { id: 'granary', level: 1 },
      ],
    })
    expect(regionCapacity(withGranary)).toBe(regionCapacity(base) + 8)
  })
})
