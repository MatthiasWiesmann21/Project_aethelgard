import type {
  EconomyBreakdown,
  GoodId,
  MarketGood,
  Modifiers,
  Region,
  Unit,
} from '../../types/game'
import type { BuildingCost, BuildingDef } from '../../types/buildings'
import {
  BUILDINGS,
  BASE_BUILDING_SLOTS,
  UPGRADE_COST_FACTOR,
} from '../../data/buildings'
import { DEPOSITS } from '../../data/deposits'
import { GOODS, GOOD_IDS } from '../../data/goods'
import {
  BASE_POP_GROWTH,
  CLAIM_BASE_COST,
  FOOD_PER_POP,
  MARKET_ELASTICITY,
  PRICE_MAX,
  PRICE_MIN,
  SCIENCE_PER_POP,
  SUBSISTENCE_FOOD_PER_POP,
  SUPPLY_EMA,
  TAX_PER_POP,
  TRADE_PRESSURE_DECAY,
} from '../../data/economy'
import {
  RIVER_FOOD,
  RIVER_GOLD,
  RIVER_POP_GROWTH,
} from '../../data/rivers'
import { TERRAIN } from '../../data/terrain'
import { UNITS } from '../../data/units'
import { riverCount } from './world'

export {
  FOOD_PER_POP,
  SUBSISTENCE_FOOD_PER_POP,
  TAX_PER_POP,
  BASE_POP_GROWTH,
  SCIENCE_PER_POP,
  TRADE_QTY,
  CLAIM_BASE_COST,
} from '../../data/economy'

export type Stockpile = Record<GoodId, number>
export type Market = Record<GoodId, MarketGood>
type Goods = Partial<Record<GoodId, number>>

export function emptyStockpile(): Stockpile {
  return { food: 0, wood: 0, stone: 0, iron: 0 }
}

export function emptyBreakdown(): EconomyBreakdown {
  return { gold: {}, food: {}, science: {} }
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

/** Population ceiling: terrain capacity + building housing bonuses. */
export function regionCapacity(region: Region): number {
  return (
    TERRAIN[region.terrain].capacity +
    region.buildings.reduce((sum, b) => sum + BUILDINGS[b.id].capacityBonus, 0)
  )
}

export interface SourceYield {
  goods: Goods
  gold: number
}

/** A region's output split by where it comes from (multipliers applied). */
export interface RegionSources {
  terrain: SourceYield
  deposit: SourceYield
  rivers: SourceYield
  buildings: SourceYield
}

function scaled(y: SourceYield, modifiers: Modifiers): SourceYield {
  const goods: Goods = {}
  for (const g of GOOD_IDS) {
    const v = y.goods[g]
    if (v) goods[g] = v * modifiers.yieldMultiplier[g]
  }
  return { goods, gold: y.gold * modifiers.goldYieldMultiplier }
}

/**
 * Per-source output of one region: terrain bonus, deposit, bordering rivers,
 * and buildings (scaled by level and workforce staffing). Terrain, deposit
 * and river yields are natural and never need workers.
 */
export function regionSources(
  region: Region,
  modifiers: Modifiers,
  regions?: Record<string, Region>,
  seed = 0,
): RegionSources {
  const terrain: SourceYield = {
    goods: { ...TERRAIN[region.terrain].yieldBonus },
    gold: 0,
  }

  const deposit: SourceYield = region.deposit
    ? {
        goods: { ...DEPOSITS[region.deposit].yieldBonus },
        gold: DEPOSITS[region.deposit].goldYield,
      }
    : { goods: {}, gold: 0 }

  const n = regions ? riverCount(seed, region, regions) : 0
  const rivers: SourceYield = {
    goods: n ? { food: n * RIVER_FOOD } : {},
    gold: n * RIVER_GOLD,
  }

  const buildings: SourceYield = { goods: {}, gold: 0 }
  const needed = regionWorkersNeeded(region)
  const staffing = needed > 0 ? Math.min(1, region.population / needed) : 1
  for (const b of region.buildings) {
    const def = BUILDINGS[b.id]
    for (const g of GOOD_IDS) {
      const v = def.yields[g]
      if (v) buildings.goods[g] = (buildings.goods[g] ?? 0) + v * b.level * staffing
    }
    buildings.gold += def.goldYield * b.level * staffing
  }

  return {
    terrain: scaled(terrain, modifiers),
    deposit: scaled(deposit, modifiers),
    rivers: scaled(rivers, modifiers),
    buildings: scaled(buildings, modifiers),
  }
}

/** Total per-tick output of one region (sum of all sources). */
export function regionOutput(
  region: Region,
  modifiers: Modifiers,
  regions?: Record<string, Region>,
  seed = 0,
): SourceYield {
  const goods: Goods = {}
  let gold = 0
  for (const s of Object.values(regionSources(region, modifiers, regions, seed))) {
    for (const g of GOOD_IDS) {
      const v = s.goods[g]
      if (v) goods[g] = (goods[g] ?? 0) + v
    }
    gold += s.gold
  }
  return { goods, gold }
}

/** Cost of upgrading a building to `level` (the target level, 2 or 3). */
export function upgradeCost(def: BuildingDef, level: number): BuildingCost {
  const f = 1 + (level - 1) * UPGRADE_COST_FACTOR
  const goods: Goods = {}
  for (const g of GOOD_IDS) {
    const v = def.cost.goods[g]
    if (v) goods[g] = Math.ceil(v * f)
  }
  return { goods, gold: Math.ceil(def.cost.gold * f) }
}

/** Total monthly upkeep of all units. */
export function unitUpkeep(units: readonly Unit[]): { gold: number; food: number } {
  let gold = 0
  let food = 0
  for (const u of units) {
    gold += UNITS[u.kind].upkeep.gold
    food += UNITS[u.kind].upkeep.food
  }
  return { gold, food }
}

export interface EconomyTickResult {
  goodsDelta: Stockpile
  goldDelta: number
  scienceGain: number
  /** regionId → new population. */
  population: Record<string, number>
  market: Market
  tradePressure: Stockpile
  /** Food shortage — population growth is halted this tick. */
  starving: boolean
  /** Per-source breakdown behind gold, food and science rates. */
  breakdown: EconomyBreakdown
}

function add(bucket: Record<string, number>, label: string, v: number): void {
  if (v) bucket[label] = (bucket[label] ?? 0) + v
}

export function computeEconomyTick(
  regions: Record<string, Region>,
  market: Market,
  tradePressure: Stockpile,
  stockpile: Stockpile,
  modifiers: Modifiers,
  seed = 0,
  units: readonly Unit[] = [],
): EconomyTickResult {
  const owned = ownedRegions(regions)
  const goodsDelta = emptyStockpile()
  const breakdown = emptyBreakdown()
  let totalPop = 0

  for (const r of owned) {
    const sources = regionSources(r, modifiers, regions, seed)
    const labels: Record<keyof RegionSources, string> = {
      terrain: 'Terrain',
      deposit: 'Deposits',
      rivers: 'Rivers',
      buildings: 'Buildings',
    }
    for (const key of Object.keys(sources) as (keyof RegionSources)[]) {
      const s = sources[key]
      for (const g of GOOD_IDS) goodsDelta[g] += s.goods[g] ?? 0
      add(breakdown.food, labels[key], s.goods.food ?? 0)
      add(breakdown.gold, labels[key], s.gold)
    }
    totalPop += r.population
  }

  const foodNeed = totalPop * FOOD_PER_POP
  const subsistence = totalPop * SUBSISTENCE_FOOD_PER_POP
  const taxes = totalPop * TAX_PER_POP
  const upkeep = unitUpkeep(units)
  goodsDelta.food += subsistence - foodNeed - upkeep.food
  add(breakdown.food, 'Subsistence', subsistence)
  add(breakdown.food, 'Consumption', -foodNeed)
  add(breakdown.food, 'Unit upkeep', -upkeep.food)
  add(breakdown.gold, 'Taxes', taxes)
  add(breakdown.gold, 'Unit upkeep', -upkeep.gold)
  const goldDelta = Object.values(breakdown.gold).reduce((a, b) => a + b, 0)

  // Food shortage stalls growth — people never die of it.
  const starving = stockpile.food + goodsDelta.food < 0
  const baseScience = totalPop * SCIENCE_PER_POP
  const scienceGain = baseScience * modifiers.scienceMultiplier
  add(breakdown.science, 'Population', baseScience)
  add(breakdown.science, 'Research bonuses', scienceGain - baseScience)

  const population: Record<string, number> = {}
  for (const r of owned) {
    if (starving) {
      population[r.id] = r.population
    } else {
      const localBonus =
        r.buildings.reduce((sum, b) => sum + BUILDINGS[b.id].popGrowthBonus, 0) +
        riverCount(seed, r, regions) * RIVER_POP_GROWTH
      const rate =
        BASE_POP_GROWTH * modifiers.popGrowthMultiplier * (1 + localBonus)
      // Housing caps growth — crowded regions stop expanding.
      population[r.id] = Math.min(
        Math.max(regionCapacity(r), r.population),
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
    breakdown,
  }
}

export function claimCost(modifiers: Modifiers): number {
  return Math.round(CLAIM_BASE_COST * modifiers.claimCostMultiplier)
}

export function canAffordCost(
  stockpile: Stockpile,
  gold: number,
  cost: { goods: Goods; gold: number },
): boolean {
  if (gold < cost.gold) return false
  return GOOD_IDS.every((g) => (stockpile[g] ?? 0) >= (cost.goods[g] ?? 0))
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
