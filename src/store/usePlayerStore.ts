import { create } from 'zustand'
import type { EconomyBreakdown } from '../types/game'
import type { Stockpile } from '../core/systems/economy'

interface PlayerState {
  stockpile: Stockpile
  gold: number
  /** Net gold change from the last economy tick. */
  goldRate: number
  /** Science produced last tick (displayed as rate in the HUD). */
  scienceRate: number
  /** Net per-tick change per good from the last economy tick. */
  goodsRate: Stockpile
  /** Per-source contributions behind the rates (HUD tooltips). */
  breakdown: EconomyBreakdown
}

export const STARTING_PLAYER: PlayerState = {
  stockpile: { food: 20, wood: 25, stone: 10, iron: 0 },
  gold: 60,
  goldRate: 0,
  scienceRate: 0,
  goodsRate: { food: 0, wood: 0, stone: 0, iron: 0 },
  breakdown: { gold: {}, food: {}, science: {} },
}

export const usePlayerStore = create<PlayerState>()(() => ({
  ...STARTING_PLAYER,
}))
