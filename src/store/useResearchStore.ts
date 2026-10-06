import { create } from 'zustand'
import type { Modifiers } from '../types/game'
import { TECHS } from '../data/techs'
import {
  baseModifiers,
  pruneQueue,
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
  /** Starts the tech when idle, queues it when busy (prerequisites may be
   * active or queued earlier); clicking a queued tech removes it and any
   * queued techs that depended on it. */
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
      set({
        queue: pruneQueue(
          queue.filter((id) => id !== techId),
          completed,
          activeId,
        ),
      })
      return
    }
    if (activeId === techId) return
    const era = useGameStore.getState().era
    const planned = activeId ? [activeId, ...queue] : queue
    if (researchBlockReason(tech, completed, era, planned) !== null) return
    if (!activeId && researchBlockReason(tech, completed, era) === null) {
      set({ activeId: techId, progress: 0 })
    } else {
      set({ queue: [...queue, techId] })
    }
  },
}))
