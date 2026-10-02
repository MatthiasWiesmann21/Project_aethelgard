import { describe, expect, it } from 'vitest'
import { tickOnce } from './GameLoop'
import { useGameStore } from '../store/useGameStore'
import { usePlayerStore } from '../store/usePlayerStore'

describe('tickOnce (integration)', () => {
  it('advances tick and updates the economy through the stores', () => {
    const t0 = useGameStore.getState().tick
    const food0 = usePlayerStore.getState().stockpile.food

    tickOnce()
    tickOnce()

    const g = useGameStore.getState()
    const p = usePlayerStore.getState()
    expect(g.tick).toBe(t0 + 2)
    // Capital farm produces more than the starting population eats.
    expect(p.stockpile.food).toBeGreaterThan(food0)
    expect(p.scienceRate).toBeGreaterThan(0)
  })

  it('progresses active research with accumulated science', () => {
    useGameStore.getState().newGame(42)
    usePlayerStore.setState({ stockpile: { food: 500, wood: 0, stone: 0, iron: 0 }, gold: 0 })
    useResearchStoreForTest()

    for (let i = 0; i < 60; i++) tickOnce()

    const r = useGameStore.getState()
    expect(r.tick).toBe(60)
    // ~12 science/tick → 'oral_tradition' (cost 12) completes quickly.
    expect(useResearchStoreState().completed).toContain('oral_tradition')
  })
})

// Helpers kept local to avoid import-order surprises in the test file.
import { useResearchStore } from '../store/useResearchStore'
function useResearchStoreForTest() {
  useResearchStore.setState({ activeId: 'oral_tradition', progress: 0, completed: [] })
}
function useResearchStoreState() {
  return useResearchStore.getState()
}
