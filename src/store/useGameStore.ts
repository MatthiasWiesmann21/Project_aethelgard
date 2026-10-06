import { create } from 'zustand'
import type {
  Era,
  GameSpeed,
  GoodId,
  LogEntry,
  Region,
  Unit,
  UnitKind,
  WindowId,
} from '../types/game'
import type { Market, Stockpile } from '../core/systems/economy'
import {
  canAffordCost,
  claimCost,
  emptyStockpile,
  initialMarket,
  regionMaxSlots,
  upgradeCost,
} from '../core/systems/economy'
import {
  advanceUnit,
  findPath,
  generateWorld,
  isClaimable,
  isRiver,
  mulberry32,
  revealAround,
  revealRadius,
} from '../core/systems/world'
import {
  recruitBlockReason,
  resolveStackAttack,
  unitMoves,
} from '../core/systems/military'
import { baseModifiers } from '../core/systems/research'
import {
  deleteSave,
  loadGame,
  saveGame,
  startingUnits,
  type GameSnapshot,
} from '../core/persistence'
import {
  BUILDINGS,
  BUILD_TICKS,
  MAX_BUILDING_LEVEL,
} from '../data/buildings'
import { CLAIM_START_POP } from '../data/economy'
import { RIVER_ATTACK_PENALTY } from '../data/rivers'
import { UNITS } from '../data/units'
import type { BuildingId } from '../types/buildings'
import { STARTING_PLAYER, usePlayerStore } from './usePlayerStore'
import { useResearchStore } from './useResearchStore'

const MAX_LOG = 60
const PLAYER = 'player'

interface GameState {
  tick: number
  era: Era
  seed: number
  paused: boolean
  speed: GameSpeed
  regions: Record<string, Region>
  units: Unit[]
  market: Market
  /** Buy orders push demand up (positive), sell orders add supply (negative). */
  tradePressure: Stockpile
  selectedRegionId: string | null
  selectedUnitId: string | null
  windows: Record<WindowId, boolean>
  log: LogEntry[]

  newGame: (seed?: number) => void
  togglePause: () => void
  setSpeed: (speed: GameSpeed) => void
  selectRegion: (id: string | null) => void
  selectUnit: (id: string | null) => void
  toggleWindow: (w: WindowId) => void
  claimRegion: (regionId: string) => void
  constructBuilding: (regionId: string, building: BuildingId) => void
  upgradeBuilding: (regionId: string, building: BuildingId) => void
  moveUnit: (unitId: string, targetRegionId: string) => void
  recruitUnit: (regionId: string, kind: UnitKind) => void
  /** All listed units (same region, with moves left) attack `targetId`
   * together with their combined strength. */
  attackWithUnits: (unitIds: string[], targetId: string) => void
  /** qty > 0 buys, qty < 0 sells at current market price. */
  trade: (good: GoodId, qty: number) => void
  pushLog: (message: string) => void
  saveAs: (name?: string) => void
  loadSlot: (name: string) => void
  deleteSlot: (name: string) => void
}

const CLOSED_WINDOWS = { research: false, market: false, saves: false }

/** Everything needed to persist and restore a game, read from all stores. */
export function snapshotState(): GameSnapshot {
  const g = useGameStore.getState()
  const p = usePlayerStore.getState()
  const r = useResearchStore.getState()
  return {
    game: {
      tick: g.tick,
      era: g.era,
      seed: g.seed,
      regions: g.regions,
      units: g.units,
      market: g.market,
      tradePressure: g.tradePressure,
      log: g.log,
    },
    player: {
      stockpile: p.stockpile,
      gold: p.gold,
      goldRate: p.goldRate,
      scienceRate: p.scienceRate,
      goodsRate: p.goodsRate,
      breakdown: p.breakdown,
    },
    research: {
      activeId: r.activeId,
      progress: r.progress,
      completed: r.completed,
      queue: r.queue,
      modifiers: r.modifiers,
    },
  }
}

function freshWorld(seed = Math.floor(Math.random() * 1e9)) {
  const regions = generateWorld(seed)
  return { seed, regions, units: startingUnits(regions) }
}

function applySave(saved: GameSnapshot) {
  usePlayerStore.setState(saved.player)
  useResearchStore.setState(saved.research)
  return {
    tick: saved.game.tick,
    era: saved.game.era,
    seed: saved.game.seed,
    paused: true,
    speed: 1 as GameSpeed,
    regions: saved.game.regions,
    units: saved.game.units,
    market: saved.game.market,
    tradePressure: saved.game.tradePressure,
    selectedRegionId: null,
    selectedUnitId: null,
    windows: { ...CLOSED_WINDOWS },
    log: [
      ...saved.game.log,
      { tick: saved.game.tick, message: 'Save loaded.' },
    ],
  }
}

function makeInitialState() {
  const saved = loadGame()
  if (saved) return applySave(saved)
  return {
    tick: 0,
    era: 'ancient' as Era,
    ...freshWorld(),
    paused: false,
    speed: 1 as GameSpeed,
    market: initialMarket(),
    tradePressure: emptyStockpile(),
    selectedRegionId: null,
    selectedUnitId: null,
    windows: { ...CLOSED_WINDOWS },
    log: [] as LogEntry[],
  }
}

function payCost(cost: { goods: Partial<Record<GoodId, number>>; gold: number }): void {
  const { stockpile, gold } = usePlayerStore.getState()
  const next = { ...stockpile }
  for (const [g, v] of Object.entries(cost.goods)) next[g as GoodId] -= v ?? 0
  usePlayerStore.setState({ stockpile: next, gold: gold - cost.gold })
}

function seededRoll(seed: number, tick: number, a: string, b: string): number {
  return mulberry32(
    seed ^ (tick * 7919) ^
      (parseInt(a.slice(1), 10) || 0) * 31 ^
      (parseInt(b.slice(1), 10) || 0),
  )()
}

export const useGameStore = create<GameState>()((set, get) => ({
  ...makeInitialState(),

  newGame: (seed?: number) => {
    set({
      tick: 0,
      era: 'ancient',
      ...freshWorld(seed),
      paused: false,
      market: initialMarket(),
      tradePressure: emptyStockpile(),
      selectedRegionId: null,
      selectedUnitId: null,
      windows: { ...CLOSED_WINDOWS },
      log: [],
    })
    usePlayerStore.setState({ ...STARTING_PLAYER })
    useResearchStore.setState({
      activeId: null,
      progress: 0,
      completed: [],
      queue: [],
      modifiers: baseModifiers(),
    })
  },

  togglePause: () => set((s) => ({ paused: !s.paused })),
  setSpeed: (speed) => set({ speed }),
  selectRegion: (id) => set({ selectedRegionId: id, selectedUnitId: null }),
  selectUnit: (id) => set({ selectedUnitId: id, selectedRegionId: null }),
  toggleWindow: (w) =>
    set((s) => ({ windows: { ...s.windows, [w]: !s.windows[w] } })),

  claimRegion: (regionId) => {
    const { regions } = get()
    const region = regions[regionId]
    if (!region || !isClaimable(region, regions)) return
    const cost = claimCost(useResearchStore.getState().modifiers)
    const { gold } = usePlayerStore.getState()
    if (gold < cost) return

    usePlayerStore.setState({ gold: gold - cost })
    set({
      regions: revealAround({
        ...regions,
        [regionId]: {
          ...region,
          ownerId: PLAYER,
          population: CLAIM_START_POP,
          explored: true,
        },
      }),
    })
    get().pushLog(`${region.name} joined your realm.`)
  },

  constructBuilding: (regionId, buildingId) => {
    const { regions } = get()
    const region = regions[regionId]
    const def = BUILDINGS[buildingId]
    if (!region || !def || region.ownerId !== PLAYER) return
    if (region.construction) return
    const { modifiers, completed } = useResearchStore.getState()
    if (region.buildings.length >= regionMaxSlots(modifiers)) return
    if (!def.allowedTerrain.includes(region.terrain)) return
    if (def.requiredTech && !completed.includes(def.requiredTech)) return
    if (region.buildings.some((b) => b.id === buildingId)) return
    const { stockpile, gold } = usePlayerStore.getState()
    if (!canAffordCost(stockpile, gold, def.cost)) return

    payCost(def.cost)
    set({
      regions: {
        ...regions,
        [regionId]: {
          ...region,
          construction: { id: buildingId, ticksLeft: BUILD_TICKS },
        },
      },
    })
    get().pushLog(
      `Construction of ${def.name} started in ${region.name} (${BUILD_TICKS} months).`,
    )
  },

  upgradeBuilding: (regionId, buildingId) => {
    const { regions } = get()
    const region = regions[regionId]
    if (!region || region.ownerId !== PLAYER) return
    const inst = region.buildings.find((b) => b.id === buildingId)
    const def = BUILDINGS[buildingId]
    if (!inst || !def || inst.level >= MAX_BUILDING_LEVEL) return
    const cost = upgradeCost(def, inst.level + 1)
    const { stockpile, gold } = usePlayerStore.getState()
    if (!canAffordCost(stockpile, gold, cost)) return

    payCost(cost)
    set({
      regions: {
        ...regions,
        [regionId]: {
          ...region,
          buildings: region.buildings.map((b) =>
            b.id === buildingId ? { ...b, level: b.level + 1 } : b,
          ),
          garrison: region.garrison + def.garrisonBonus,
        },
      },
    })
    get().pushLog(
      `${def.name} upgraded to level ${inst.level + 1} in ${region.name}.`,
    )
  },

  moveUnit: (unitId, targetRegionId) => {
    const { regions, units, seed, era } = get()
    const unit = units.find((u) => u.id === unitId)
    if (!unit || !regions[targetRegionId]) return
    // Order a destination anywhere on land — the unit walks the cheapest
    // path there, spending this tick's moves now and continuing next tick.
    const path = findPath(regions, unit.regionId, targetRegionId, seed)
    if (!path) return

    const moved: Unit = { ...unit, path }
    const max = unitMoves(unit, era, useResearchStore.getState().modifiers)
    const nextRegions = advanceUnit(moved, regions, seed, max)
    set({
      units: units.map((u) => (u.id === unitId ? moved : u)),
      regions: nextRegions,
    })
  },

  recruitUnit: (regionId, kind) => {
    const { regions, units, era } = get()
    const region = regions[regionId]
    const def = UNITS[kind]
    if (!region || !def) return
    const { completed, modifiers } = useResearchStore.getState()
    const { stockpile, gold } = usePlayerStore.getState()
    if (recruitBlockReason(kind, region, stockpile, gold, completed) !== null) {
      return
    }

    payCost({ goods: { food: def.cost.food, iron: def.cost.iron }, gold: def.cost.gold })
    const nextId = `u${Math.max(-1, ...units.map((u) => Number(u.id.slice(1)) || 0)) + 1}`
    const unit: Unit = {
      id: nextId,
      kind,
      regionId,
      strength: def.strength,
      movesLeft: unitMoves({ kind }, era, modifiers),
      sight: def.sight,
      path: [],
    }
    set({
      units: [...units, unit],
      regions: {
        ...regions,
        [regionId]: { ...region, population: region.population - def.cost.pop },
      },
    })
    get().pushLog(`${def.name} recruited in ${region.name}.`)
  },

  attackWithUnits: (unitIds, targetId) => {
    const { regions, units, seed, tick, selectedUnitId } = get()
    const target = regions[targetId]
    if (!target || !target.hostile || !target.explored) return
    // Attacking costs a move; all attackers must stand in the same region.
    const attackers = units.filter(
      (u) => unitIds.includes(u.id) && u.movesLeft > 0,
    )
    if (attackers.length === 0) return
    const fromId = attackers[0].regionId
    const from = regions[fromId]
    if (!from?.neighborIds.includes(targetId)) return
    const stack = attackers.filter((u) => u.regionId === fromId)

    const roll = seededRoll(seed, tick, stack[0].id, targetId)
    const riverPenalty = isRiver(seed, regions, fromId, targetId)
      ? RIVER_ATTACK_PENALTY
      : 1
    const result = resolveStackAttack(
      stack.map((u) => u.strength),
      target.garrison,
      roll,
      useResearchStore.getState().modifiers,
      riverPenalty,
    )
    const ids = new Set(stack.map((u) => u.id))
    const label =
      stack.length === 1 ? `your ${UNITS[stack[0].kind].name}` : `${stack.length} units`

    if (result.victory) {
      let nextRegions = revealAround({
        ...regions,
        [targetId]: {
          ...target,
          ownerId: PLAYER,
          hostile: false,
          garrison: 0,
          population: CLAIM_START_POP,
          explored: true,
        },
      })
      nextRegions = revealRadius(
        nextRegions,
        targetId,
        Math.max(...stack.map((u) => u.sight)),
      )
      set({
        regions: nextRegions,
        units: units.map((u) => {
          const i = stack.findIndex((s) => s.id === u.id)
          return i < 0
            ? u
            : {
                ...u,
                regionId: targetId,
                strength: result.survivors[i],
                movesLeft: u.movesLeft - 1,
                path: [],
              }
        }),
      })
      get().pushLog(`${target.name} captured by ${label}!`)
    } else {
      set({
        units: units.filter((u) => !ids.has(u.id)),
        selectedUnitId:
          selectedUnitId && ids.has(selectedUnitId) ? null : selectedUnitId,
        regions: {
          ...regions,
          [targetId]: { ...target, garrison: result.remainingGarrison },
        },
      })
      get().pushLog(
        `Attack on ${target.name} failed — ${label} lost (garrison now ${result.remainingGarrison}).`,
      )
    }
  },

  trade: (good, qty) => {
    const { market, tradePressure } = get()
    const { stockpile, gold } = usePlayerStore.getState()
    const price = market[good].price
    if (qty > 0) {
      const cost = price * qty
      if (gold < cost) return
      usePlayerStore.setState({
        gold: gold - cost,
        stockpile: { ...stockpile, [good]: stockpile[good] + qty },
      })
    } else {
      const n = -qty
      if (stockpile[good] < n) return
      usePlayerStore.setState({
        gold: gold + price * n,
        stockpile: { ...stockpile, [good]: stockpile[good] - n },
      })
    }
    set({
      tradePressure: { ...tradePressure, [good]: tradePressure[good] + qty },
    })
  },

  pushLog: (message) =>
    set((s) => ({
      log: [...s.log.slice(-(MAX_LOG - 1)), { tick: s.tick, message }],
    })),

  saveAs: (name = 'auto') => {
    saveGame(snapshotState(), name)
    get().pushLog(`Game saved to "${name}".`)
  },

  loadSlot: (name) => {
    const saved = loadGame(name)
    if (saved) set(applySave(saved))
  },

  deleteSlot: (name) => {
    deleteSave(name)
  },
}))
