import type { BuildingId } from './buildings'

export type GoodId = 'food' | 'wood' | 'stone' | 'iron'

export type Era = 'ancient' | 'medieval' | 'renaissance' | 'industrial'

export type TerrainType =
  | 'plains'
  | 'forest'
  | 'hills'
  | 'mountain'
  | 'coast'
  | 'water'

export type GameSpeed = 1 | 2 | 4

export type WindowId = 'research' | 'market' | 'saves'

/** Natural resource deposit found on some regions — flat yield bonus. */
export type DepositId =
  | 'fertile_soil'
  | 'iron_deposit'
  | 'stone_ridge'
  | 'ancient_grove'
  | 'natural_harbor'

export interface Vec2 {
  x: number
  y: number
}

export interface BuildingInstance {
  id: BuildingId
  level: number
}

export interface Region {
  id: string
  name: string
  /** Clipped Voronoi polygon vertices (closed ring) for SVG rendering. */
  polygon: Vec2[]
  centroid: Vec2
  terrain: TerrainType
  neighborIds: string[]
  /** 'player' or null (unowned). Reserved for AI factions later. */
  ownerId: string | null
  /** Neutral hostile force occupying the region — must be conquered, not claimed. */
  hostile: boolean
  explored: boolean
  isCapital: boolean
  population: number
  buildings: BuildingInstance[]
  /** Building under construction — finishes in `ticksLeft` ticks. */
  construction: { id: BuildingId; ticksLeft: number } | null
  deposit: DepositId | null
  /** Defensive strength (hostile defenders or player's garrison). */
  garrison: number
  /** Player's assembled attack force stationed in this region. */
  army: number
}

export interface MarketGood {
  goodId: GoodId
  basePrice: number
  price: number
  prevPrice: number
  /** Exponential moving average of recent production + stockpile inflow. */
  supply: number
  /** Baseline demand + consumption + decaying trade pressure. */
  demand: number
}

export interface LogEntry {
  tick: number
  message: string
}

/** Aggregated, folded effects of all completed research. */
export interface Modifiers {
  yieldMultiplier: Record<GoodId, number>
  goldYieldMultiplier: number
  popGrowthMultiplier: number
  scienceMultiplier: number
  claimCostMultiplier: number
  armyMultiplier: number
  extraBuildingSlots: number
  garrisonBonus: number
  unlockedBuildings: BuildingId[]
  unlockedUnits: UnitKind[]
}

export type UnitKind = 'warrior' | 'traveler'

/** A mobile unit that scouts the map (revealing fog) and can fight. */
export interface Unit {
  id: string
  kind: UnitKind
  regionId: string
  strength: number
  /** Regions-per-tick movement allowance; refills every tick. */
  moves: number
  movesLeft: number
  /** Sight radius in graph hops around the unit's region. */
  sight: number
  /** Remaining waypoints of a multi-tick move order (excluding current region). */
  path: string[]
}
