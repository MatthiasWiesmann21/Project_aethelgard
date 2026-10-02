import type {
  GoodId,
  MarketGood,
  Modifiers,
  Region,
} from '../../types/game'
import type { BuildingCost, BuildingDef } from '../../types/buildings'
import {
  BUILDINGS,
  BASE_BUILDING_SLOTS,
  UPGRADE_COST_FACTOR,
} from '../../data/buildings'
import { DEPOSITS } from '../../data/deposits'
import { GOODS, GOOD_IDS } from '../../data/goods'
import { TERRAIN } from '../../data/terrain'

export const FOOD_PER_POP = 0.2
/** Everyone farms a little — population always produces some food. */
export const SUBSISTENCE_FOOD_PER_POP = 0.15
/** Baseline tax income per population. */
export const TAX_PER_POP = 0.25
/** ~6%/year at monthly ticks. */
export const BASE_POP_GROWTH = 0.005
export const SCIENCE_PER_POP = 0.12
export const MARKET_ELASTICITY = 0.6
export const PRICE_MIN = 0.2
export const PRICE_MAX = 6
export const SUPPLY_EMA = 0.3
export const TRADE_PRESSURE_DECAY = 0.8
export const TRADE_QTY = 10
export const CLAIM_BASE_COST = 40

export type Stockpile = Record<GoodId, number>
export type Market = Record<GoodId, MarketGood>

export function emptyStockpile(): Stockpile {
  return { food: 0, wood: 0, stone: 0, iron: 0 }
}

export function initialMarket(): Market {
  const market = {} as Market
  for (const g of GOOD_IDS) {
    market[g] = {
      goodId: g,
      basePrice: GOODS[g].basePrice,
      price: GOODS[g].basePrice,
      prevPrice: GOODS[g].basePrice,
      supply: GOODS[g].baseDemand,
      demand: GOODS[g].baseDemand,
    }
  }
  return market
}

export function ownedRegions(regions: Record<string, Region>): Region[] {
  return Object.values(regions).filter((r) => r.ownerId === 'player')
}

export function regionMaxSlots(modifiers: Modifiers): number {
  return BASE_BUILDING_SLOTS + modifiers.extraBuildingSlots
}

/** Workers needed to fully staff all buildings in a region. */
export function regionWorkersNeeded(region: Region): number {
  return region.buildings.reduce((sum, b) => sum + BUILDINGS[b.id].workers, 0)
}

/** Housing cap by terrain — how many people a region can hold. */
export const TERRAIN_CAPACITY: Record<string, number> = {
  plains: 20,
  forest: 16,
  hills: 14,
  mountain: 10,
  coast: 18,
  water: 0,
}

/** Population ceiling: terrain capacity + building housing bonuses. */
export function regionCapacity(region: Region): number {
  return (
    (TERRAIN_CAPACITY[region.terrain] ?? 0) +
    region.buildings.reduce((sum, b) => sum + BUILDINGS[b.id].capacityBonus, 0)
  )
}

/**
 * Total per-tick output of one region: terrain bonus + deposit + building
 * yields (scaled by level and by workforce staffing). Terrain and deposit
 * yields are natural and never need workers.
 */
export function regionOutput(
  region: Region,
  modifiers: Modifiers,
): { goods: Partial<Record<GoodId, number>>; gold: number } {
  const goods: Partial<Record<GoodId, number>> = {
    ...TERRAIN[region.terrain].yieldBonus,
  }
  let gold = 0

  if (region.deposit) {
    const dep = DEPOSITS[region.deposit]
    for (const g of GOOD_IDS) {
      const v = dep.yieldBonus[g]
      if (v) goods[g] = (goods[g] ?? 0) + v
    }
    gold += dep.goldYield
  }

  const needed = regionWorkersNeeded(region)
  const staffing = needed > 0 ? Math.min(1, region.population / needed) : 1
  for (const b of region.buildings) {
    const def = BUILDINGS[b.id]
    for (const g of GOOD_IDS) {
      const v = def.yields[g]
      if (v) goods[g] = (goods[g] ?? 0) + v * b.level * staffing
    }
    gold += def.goldYield * b.level * staffing
  }

  for (const g of GOOD_IDS) {
    if (goods[g]) goods[g] = goods[g]! * modifiers.yieldMultiplier[g]
  }
  return { goods, gold: gold * modifiers.goldYieldMultiplier }
}

/** Cost of upgrading a building to `level` (the target level, 2 or 3). */
export function upgradeCost(def: BuildingDef, level: number): BuildingCost {
  const f = 1 + (level - 1) * UPGRADE_COST_FACTOR
  const goods: Partial<Record<GoodId, number>> = {}
  for (const g of GOOD_IDS) {
    const v = def.cost.goods[g]
    if (v) goods[g] = Math.ceil(v * f)
  }
  return { goods, gold: Math.ceil(def.cost.gold * f) }
}

export interface EconomyTickResult {
  goodsDelta: Stockpile
  goldDelta: number
  scienceGain: number
  /** regionId → new population. */
  population: Record<string, number>
  market: Market
  tradePressure: Stockpile
  starving: boolean
}

export function computeEconomyTick(
  regions: Record<string, Region>,
  market: Market,
  tradePressure: Stockpile,
  stockpile: Stockpile,
  modifiers: Modifiers,
): EconomyTickResult {
  const owned = ownedRegions(regions)
  const goodsDelta = emptyStockpile()
  let goldDelta = 0
  let totalPop = 0

  for (const r of owned) {
    const out = regionOutput(r, modifiers)
    for (const g of GOOD_IDS) goodsDelta[g] += out.goods[g] ?? 0
    goldDelta += out.gold
    totalPop += r.population
  }

  const foodNeed = totalPop * FOOD_PER_POP
  goodsDelta.food += totalPop * SUBSISTENCE_FOOD_PER_POP - foodNeed
  goldDelta += totalPop * TAX_PER_POP
  // Food shortage stalls growth — people never die of it.
  const starving = stockpile.food + goodsDelta.food < 0
  const scienceGain = totalPop * SCIENCE_PER_POP * modifiers.scienceMultiplier

  const population: Record<string, number> = {}
  for (const r of owned) {
    if (starving) {
      population[r.id] = r.population
    } else {
      const localBonus = r.buildings.reduce(
        (sum, b) => sum + BUILDINGS[b.id].popGrowthBonus,
        0,
      )
      const rate =
        BASE_POP_GROWTH * modifiers.popGrowthMultiplier * (1 + localBonus)
      // Housing caps growth — crowded regions stop expanding.
      population[r.id] = Math.min(
        regionCapacity(r),
        r.population * (1 + rate),
      )
    }
  }

  const newMarket = {} as Market
  for (const g of GOOD_IDS) {
    const prev = market[g]
    const inflow = Math.max(0, goodsDelta[g]) + Math.max(0, stockpile[g]) * 0.05
    const supply = prev.supply * (1 - SUPPLY_EMA) + inflow * SUPPLY_EMA
    const demand =
      GOODS[g].baseDemand +
      (g === 'food' ? foodNeed : 0) +
      Math.max(0, tradePressure[g])
    const supplyAdj = supply + Math.max(0, -tradePressure[g])
    const price = clamp(
      prev.basePrice *
        Math.pow(demand / Math.max(supplyAdj, 0.5), MARKET_ELASTICITY),
      prev.basePrice * PRICE_MIN,
      prev.basePrice * PRICE_MAX,
    )
    newMarket[g] = { ...prev, prevPrice: prev.price, price, supply, demand }
  }

  const newPressure = emptyStockpile()
  for (const g of GOOD_IDS) {
    newPressure[g] = tradePressure[g] * TRADE_PRESSURE_DECAY
  }

  return {
    goodsDelta,
    goldDelta,
    scienceGain,
    population,
    market: newMarket,
    tradePressure: newPressure,
    starving,
  }
}

export function claimCost(modifiers: Modifiers): number {
  return Math.round(CLAIM_BASE_COST * modifiers.claimCostMultiplier)
}

export function canAffordCost(
  stockpile: Stockpile,
  gold: number,
  cost: { goods: Partial<Record<GoodId, number>>; gold: number },
): boolean {
  if (gold < cost.gold) return false
  return GOOD_IDS.every((g) => (stockpile[g] ?? 0) >= (cost.goods[g] ?? 0))
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
