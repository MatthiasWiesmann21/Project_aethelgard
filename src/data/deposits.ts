import type { DepositId, GoodId, TerrainType } from '../types/game'

export interface DepositDef {
  id: DepositId
  label: string
  /** Emoji glyph rendered on the map at the region centroid. */
  glyph: string
  yieldBonus: Partial<Record<GoodId, number>>
  goldYield: number
  /** Terrains this deposit may appear on. */
  preferredTerrain: readonly TerrainType[]
}

export const DEPOSITS: Record<DepositId, DepositDef> = {
  fertile_soil: {
    id: 'fertile_soil',
    label: 'Fertile Soil',
    glyph: '🌾',
    yieldBonus: { food: 2 },
    goldYield: 0,
    preferredTerrain: ['plains'],
  },
  iron_deposit: {
    id: 'iron_deposit',
    label: 'Iron Deposit',
    glyph: '⛏',
    yieldBonus: { iron: 2 },
    goldYield: 0,
    preferredTerrain: ['hills', 'mountain'],
  },
  stone_ridge: {
    id: 'stone_ridge',
    label: 'Stone Ridge',
    glyph: '🪨',
    yieldBonus: { stone: 2 },
    goldYield: 0,
    preferredTerrain: ['hills', 'mountain'],
  },
  ancient_grove: {
    id: 'ancient_grove',
    label: 'Ancient Grove',
    glyph: '🌳',
    yieldBonus: { wood: 2 },
    goldYield: 0,
    preferredTerrain: ['forest'],
  },
  natural_harbor: {
    id: 'natural_harbor',
    label: 'Natural Harbor',
    glyph: '⚓',
    yieldBonus: {},
    goldYield: 2,
    preferredTerrain: ['coast'],
  },
}

export const DEPOSIT_IDS = Object.keys(DEPOSITS) as DepositId[]
