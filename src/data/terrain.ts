import type { GoodId, TerrainType } from '../types/game'
import type { BuildingId } from '../types/buildings'

export interface TerrainDef {
  label: string
  /** Bright flat map fill color. */
  fill: string
  /** Slightly darker border color. */
  stroke: string
  /** Desaturated fill used when the region is unexplored (fog of war). */
  fogFill: string
  /** Flat per-tick yield bonus for regions of this terrain. */
  yieldBonus: Partial<Record<GoodId, number>>
  allowedBuildings: readonly BuildingId[]
}

const ALL_LAND: readonly BuildingId[] = ['market', 'workshop', 'barracks']

export const TERRAIN: Record<TerrainType, TerrainDef> = {
  plains: {
    label: 'Plains',
    fill: '#B4E07E',
    stroke: '#8FCB5B',
    fogFill: '#C9CFB8',
    yieldBonus: { food: 1 },
    allowedBuildings: ['farm', 'granary', ...ALL_LAND],
  },
  forest: {
    label: 'Forest',
    fill: '#5DBB63',
    stroke: '#3E9B4F',
    fogFill: '#B3C2AF',
    yieldBonus: { wood: 1 },
    allowedBuildings: ['lumberCamp', 'granary', ...ALL_LAND],
  },
  hills: {
    label: 'Hills',
    fill: '#E8C478',
    stroke: '#C9A154',
    fogFill: '#D3CBB4',
    yieldBonus: { stone: 1 },
    allowedBuildings: ['quarry', 'mine', ...ALL_LAND],
  },
  mountain: {
    label: 'Mountain',
    fill: '#A9B6D8',
    stroke: '#8494B8',
    fogFill: '#BFC2CC',
    yieldBonus: { iron: 1 },
    allowedBuildings: ['mine', 'barracks'],
  },
  coast: {
    label: 'Coast',
    fill: '#9ADCF0',
    stroke: '#5FBFD8',
    fogFill: '#BFD2D7',
    yieldBonus: { food: 1 },
    allowedBuildings: ['port', 'farm', 'market', 'barracks'],
  },
  water: {
    label: 'Water',
    fill: '#4FA8E0',
    stroke: '#3B8CC4',
    fogFill: '#C2CDD3',
    yieldBonus: {},
    allowedBuildings: [],
  },
}

export const FOG_STROKE = '#C4BCA8'

/** Terrain types that can be owned/settled. */
export function isLand(terrain: TerrainType): boolean {
  return terrain !== 'water'
}
