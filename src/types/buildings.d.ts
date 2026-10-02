import type { GoodId, TerrainType } from './game'

export type BuildingId =
  | 'farm'
  | 'lumberCamp'
  | 'quarry'
  | 'mine'
  | 'granary'
  | 'market'
  | 'workshop'
  | 'port'
  | 'barracks'

export interface BuildingCost {
  goods: Partial<Record<GoodId, number>>
  gold: number
}

export interface BuildingDef {
  id: BuildingId
  name: string
  description: string
  cost: BuildingCost
  /** Population needed to fully staff this building; understaffed buildings
   * produce proportionally less. */
  workers: number
  /** Goods produced per tick at level 1 (scales with level). */
  yields: Partial<Record<GoodId, number>>
  /** Gold produced per tick (taxes, trade). */
  goldYield: number
  /** Bonus multiplier to local population growth (e.g. granary). */
  popGrowthBonus: number
  /** Raises the region's housing capacity (e.g. granary). */
  capacityBonus: number
  /** Garrison capacity bonus (military hook). */
  garrisonBonus: number
  allowedTerrain: readonly TerrainType[]
  /** Tech id that must be completed before this can be built. */
  requiredTech: string | null
}
