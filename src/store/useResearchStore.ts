import { create } from 'zustand'
import type { Modifiers } from '../types/game'
import { TECHS } from '../data/techs'
import {
  baseModifiers,
  researchBlockReason,
} from '../core/systems/research'
import { useGameStore } from './useGameStore'

interface ResearchState {
  activeId: string | null
  progress: number
  completed: string[]
  /** Techs that start automatically when the active one finishes. */
  queue: string[]
  /** Folded effects of all completed techs — recomputed on unlock. */
  modifiers: Modifiers
  /** Starts the tech when idle, queues it when busy; clicking a queued
   * tech removes it from the queue. */
  startResearch: (techId: string) => void
}

export const useResearchStore = create<ResearchState>()((set, get) => ({
  activeId: null,
  progress: 0,
  completed: [],
  queue: [],
  modifiers: baseModifiers(),

  startResearch: (techId) => {
    const tech = TECHS[techId]
    if (!tech) return
    const { queue, activeId, completed } = get()
    if (queue.includes(techId)) {
      set({ queue: queue.filter((id) => id !== techId) })
      return
    }
    const era = useGameStore.getState().era
    if (researchBlockReason(tech, completed, era) !== null) return
    if (!activeId || activeId === techId) {
      set({ activeId: techId, progress: activeId === techId ? get().progress : 0 })
    } else {
      set({ queue: [...queue, techId] })
    }
  },
}))
