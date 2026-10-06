import type { GoodId, TerrainType } from '../types/game'

export interface TerrainDef {
  label: string
  /** Bright flat map fill color. */
  fill: string
  /** Lighter tint for the center of the terrain gradient. */
  highlight: string
  /** Slightly darker border color. */
  stroke: string
  /** Desaturated fill used when the region is unexplored (fog of war). */
  fogFill: string
  /** Flat per-tick yield bonus for regions of this terrain. */
  yieldBonus: Partial<Record<GoodId, number>>
  /** Housing cap — how many people a region of this terrain can hold. */
  capacity: number
  /** Move points a unit spends to enter a region of this terrain. */
  moveCost: number
}

export const TERRAIN: Record<TerrainType, TerrainDef> = {
  plains: {
    label: 'Plains',
    fill: '#B4E07E',
    highlight: '#D2F0A6',
    stroke: '#8FCB5B',
    fogFill: '#C9CFB8',
    yieldBonus: { food: 1 },
    capacity: 20,
    moveCost: 1,
  },
  forest: {
    label: 'Forest',
    fill: '#5DBB63',
    highlight: '#86D489',
    stroke: '#3E9B4F',
    fogFill: '#B3C2AF',
    yieldBonus: { wood: 1 },
    capacity: 16,
    moveCost: 2,
  },
  hills: {
    label: 'Hills',
    fill: '#E8C478',
    highlight: '#F5DCA3',
    stroke: '#C9A154',
    fogFill: '#D3CBB4',
    yieldBonus: { stone: 1 },
    capacity: 14,
    moveCost: 2,
  },
  mountain: {
    label: 'Mountain',
    fill: '#A9B6D8',
    highlight: '#CCD5EC',
    stroke: '#8494B8',
    fogFill: '#BFC2CC',
    yieldBonus: { iron: 1 },
    capacity: 10,
    moveCost: 3,
  },
  coast: {
    label: 'Coast',
    fill: '#9ADCF0',
    highlight: '#C2ECF8',
    stroke: '#5FBFD8',
    fogFill: '#BFD2D7',
    yieldBonus: { food: 1 },
    capacity: 18,
    moveCost: 1,
  },
  water: {
    label: 'Water',
    fill: '#4FA8E0',
    highlight: '#7CC3EE',
    stroke: '#3B8CC4',
    fogFill: '#C2CDD3',
    yieldBonus: {},
    capacity: 0,
    moveCost: Infinity,
  },
}

export const FOG_STROKE = '#C4BCA8'

/** Terrain types that can be owned/settled. */
export function isLand(terrain: TerrainType): boolean {
  return terrain !== 'water'
}
