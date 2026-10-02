import type { GoodId } from '../types/game'

export interface GoodDef {
  id: GoodId
  label: string
  /** Accent color used across HUD, market and building UI. */
  color: string
  basePrice: number
  /** Constant baseline market demand per tick. */
  baseDemand: number
}

export const GOODS: Record<GoodId, GoodDef> = {
  food: { id: 'food', label: 'Food', color: '#7CB342', basePrice: 1.0, baseDemand: 10 },
  wood: { id: 'wood', label: 'Wood', color: '#C08A4B', basePrice: 1.2, baseDemand: 6 },
  stone: { id: 'stone', label: 'Stone', color: '#8A99A8', basePrice: 1.5, baseDemand: 5 },
  iron: { id: 'iron', label: 'Iron', color: '#E07B54', basePrice: 2.5, baseDemand: 3 },
}

export const GOOD_IDS = Object.keys(GOODS) as GoodId[]
