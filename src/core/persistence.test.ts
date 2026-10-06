import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_SLOT,
  loadGame,
  saveGame,
  startingUnits,
  type GameSnapshot,
} from './persistence'
import { generateWorld } from './systems/world'
import { emptyStockpile, initialMarket } from './systems/economy'
import { baseModifiers } from './systems/research'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v))
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
}

function snapshot(seed: number): GameSnapshot {
  const regions = generateWorld(seed)
  return {
    game: {
      tick: 42,
      era: 'ancient',
      seed,
      regions,
      units: startingUnits(regions),
      market: initialMarket(),
      tradePressure: emptyStockpile(),
      log: [],
    },
    player: {
      stockpile: emptyStockpile(),
      gold: 10,
      goldRate: 1,
      scienceRate: 1,
      goodsRate: emptyStockpile(),
      breakdown: { gold: {}, food: {}, science: {} },
    },
    research: {
      activeId: null,
      progress: 0,
      completed: [],
      queue: [],
      modifiers: baseModifiers(),
    },
  }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('save geometry', () => {
  it('omits region geometry on disk and rebuilds it identically on load', () => {
    const snap = snapshot(7)
    saveGame(snap, 'test')
    const raw = storage.getItem('aethelgard-save-test')!
    const stored = JSON.parse(raw) as { game: { regions: Record<string, object> } }
    const first = Object.values(stored.game.regions)[0]
    expect(first).not.toHaveProperty('polygon')
    expect(first).not.toHaveProperty('neighborIds')

    const loaded = loadGame('test')!
    expect(loaded.game.regions).toEqual(snap.game.regions)
  })
})

describe('legacy save migration', () => {
  it('turns v3 region armies into Soldier units and drops stale fields', () => {
    const snap = snapshot(7)
    const capital = Object.values(snap.game.regions).find((r) => r.isCapital)!
    const legacy = {
      version: 3,
      game: {
        ...snap.game,
        regions: {
          ...snap.game.regions,
          [capital.id]: { ...capital, army: 12 },
        },
        units: snap.game.units.map((u) => ({ ...u, moves: 1, path: undefined })),
      },
      player: { stockpile: snap.player.stockpile, gold: 5, scienceRate: 0, goodsRate: emptyStockpile() },
      research: { activeId: null, progress: 0, completed: [], modifiers: { ...baseModifiers(), unitMoveBonus: undefined } },
    }
    storage.setItem(`aethelgard-save-${AUTO_SLOT}`, JSON.stringify(legacy))

    const loaded = loadGame()!
    const soldier = loaded.game.units.find((u) => u.kind === 'soldier')
    expect(soldier).toMatchObject({ regionId: capital.id, strength: 12, path: [] })
    expect(loaded.game.regions[capital.id]).not.toHaveProperty('army')
    for (const u of loaded.game.units) {
      expect(u).not.toHaveProperty('moves')
      expect(Array.isArray(u.path)).toBe(true)
    }
    expect(loaded.research.queue).toEqual([])
    expect(loaded.research.modifiers.unitMoveBonus).toBe(0)
    expect(loaded.player.breakdown).toEqual({ gold: {}, food: {}, science: {} })
  })
})
