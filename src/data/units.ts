import type { UnitKind } from '../types/game'

export interface UnitDef {
  kind: UnitKind
  name: string
  /** Emoji glyph rendered on the map. */
  glyph: string
  strength: number
  /** Regions the unit can move per tick. */
  moves: number
  /** Sight radius in graph hops — how far it reveals fog. */
  sight: number
  /** Recruit cost. */
  cost: { gold: number; food: number; pop: number }
  requiredTech: string | null
}

export const UNITS: Record<UnitKind, UnitDef> = {
  warrior: {
    kind: 'warrior',
    name: 'Warrior',
    glyph: '⚔',
    strength: 6,
    moves: 1,
    sight: 1,
    cost: { gold: 10, food: 5, pop: 1 },
    requiredTech: null,
  },
  traveler: {
    kind: 'traveler',
    name: 'Traveler',
    glyph: '🧭',
    strength: 2,
    moves: 2,
    sight: 2,
    cost: { gold: 15, food: 10, pop: 0 },
    requiredTech: 'scouting',
  },
}
