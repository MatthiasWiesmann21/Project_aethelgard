import type { UnitKind } from '../types/game'
import type { BuildingId } from '../types/buildings'

export interface UnitDef {
  kind: UnitKind
  name: string
  /** Emoji glyph rendered on the map. */
  glyph: string
  /** Token color on the map. */
  color: string
  /** Full (max) strength — units heal back up to this. */
  strength: number
  /** Base move points per tick (era + tech bonuses are added on top). */
  moves: number
  /** Sight radius in graph hops — how far it reveals fog. */
  sight: number
  /** Recruit cost. */
  cost: { gold: number; food: number; iron: number; pop: number }
  /** Monthly upkeep. */
  upkeep: { gold: number; food: number }
  requiredTech: string | null
  /** Building the recruiting region must have. */
  requiredBuilding: BuildingId | null
}

export const UNITS: Record<UnitKind, UnitDef> = {
  warrior: {
    kind: 'warrior',
    name: 'Warrior',
    glyph: '🗡',
    color: '#F97316',
    strength: 6,
    moves: 1,
    sight: 1,
    cost: { gold: 10, food: 5, iron: 0, pop: 1 },
    upkeep: { gold: 0.5, food: 0 },
    requiredTech: null,
    requiredBuilding: null,
  },
  traveler: {
    kind: 'traveler',
    name: 'Traveler',
    glyph: '🧭',
    color: '#06B6D4',
    strength: 2,
    moves: 2,
    sight: 2,
    cost: { gold: 15, food: 10, iron: 0, pop: 0 },
    upkeep: { gold: 0.5, food: 0.5 },
    requiredTech: 'scouting',
    requiredBuilding: null,
  },
  soldier: {
    kind: 'soldier',
    name: 'Soldier',
    glyph: '⚔',
    color: '#7C3AED',
    strength: 10,
    moves: 1,
    sight: 1,
    cost: { gold: 10, food: 0, iron: 5, pop: 1 },
    upkeep: { gold: 1, food: 0.5 },
    requiredTech: 'militia',
    requiredBuilding: 'barracks',
  },
}

export const UNIT_KINDS = Object.keys(UNITS) as UnitKind[]
