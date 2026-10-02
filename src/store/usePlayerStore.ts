import { create } from 'zustand'
import type { Stockpile } from '../core/systems/economy'

interface PlayerState {
  stockpile: Stockpile
  gold: number
  /** Science produced last tick (displayed as rate in the HUD). */
  scienceRate: number
  /** Net per-tick change per good from the last economy tick. */
  goodsRate: Stockpile
}

export const usePlayerStore = create<PlayerState>()(() => ({
  stockpile: { food: 20, wood: 25, stone: 10, iron: 0 },
  gold: 60,
  scienceRate: 0,
  goodsRate: { food: 0, wood: 0, stone: 0, iron: 0 },
}))
