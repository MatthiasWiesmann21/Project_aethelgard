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
  mulberry32,
  revealAround,
  revealRadius,
} from '../core/systems/world'
import {
  ARMY_PER_TRAIN,
  TRAIN_GOLD_COST,
  TRAIN_IRON_COST,
  TRAIN_POP_COST,
  resolveAttack,
  trainBlockReason,
} from '../core/systems/military'
import { baseModifiers } from '../core/systems/research'
import {
  deleteSave,
  loadGame,
  saveGame,
  startingUnits,
  type SaveData,
} from '../core/persistence'
import {
  BUILDINGS,
  BUILD_TICKS,
  MAX_BUILDING_LEVEL,
} from '../data/buildings'
import { UNITS } from '../data/units'
import type { BuildingId } from '../types/buildings'
import { usePlayerStore } from './usePlayerStore'
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
  trainArmy: (regionId: string) => void
  attackRegion: (sourceId: string, targetId: string) => void
  moveUnit: (unitId: string, targetRegionId: string) => void
  recruitUnit: (regionId: string, kind: UnitKind) => void
  attackWithUnit: (unitId: string, targetId: string) => void
  /** qty > 0 buys, qty < 0 sells at current market price. */
  trade: (good: GoodId, qty: number) => void
  pushLog: (message: string) => void
  saveAs: (name?: string) => void
  loadSlot: (name: string) => void
  deleteSlot: (name: string) => void
}

function freshWorld() {
  const seed = Math.floor(Math.random() * 1e9)
  const regions = generateWorld(seed)
  return { seed, regions, units: startingUnits(regions) }
}

const CLOSED_WINDOWS = { research: false, market: false, saves: false }

function snapshot(): Omit<SaveData, 'version'> {
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
      scienceRate: p.scienceRate,
      goodsRate: p.goodsRate,
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

function applySave(saved: SaveData) {
  usePlayerStore.setState(saved.player)
  useResearchStore.setState(saved.research)
  return {
    tick: saved.game.tick,
    era: saved.game.era,
    seed: saved.game.seed,
    paused: true,
    speed: 1 as GameSpeed,
    regions: saved.game.regions,
    units: saved.game.units ?? startingUnits(saved.game.regions),
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

export const useGameStore = create<GameState>()((set, get) => ({
  ...makeInitialState(),

  newGame: (seed?: number) => {
    const world =
      seed !== undefined
        ? { seed, regions: generateWorld(seed), units: [] as Unit[] }
        : freshWorld()
    if (seed !== undefined) world.units = startingUnits(world.regions)
    set({
      tick: 0,
      era: 'ancient',
      ...world,
      paused: false,
      market: initialMarket(),
      tradePressure: emptyStockpile(),
      selectedRegionId: null,
      selectedUnitId: null,
      windows: { ...CLOSED_WINDOWS },
      log: [],
    })
    usePlayerStore.setState({
      stockpile: { food: 20, wood: 25, stone: 10, iron: 0 },
      gold: 60,
      scienceRate: 0,
      goodsRate: { food: 0, wood: 0, stone: 0, iron: 0 },
    })
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
    const next = {
      ...regions,
      [regionId]: { ...region, ownerId: PLAYER, population: 2, explored: true },
    }
    const list = Object.values(next)
    revealAround(list)
    set({ regions: Object.fromEntries(list.map((r) => [r.id, r])) })
    get().pushLog(`${region.name} joined your realm.`)
  },

  constructBuilding: (regionId, buildingId) => {
    const { regions } = get()
    const region = regions[regionId]
    const def = BUILDINGS[buildingId]
    if (!region || !def || region.ownerId !== PLAYER) return
    const modifiers = useResearchStore.getState().modifiers
    const slotsUsed = region.buildings.length + (region.construction ? 1 : 0)
    if (slotsUsed >= regionMaxSlots(modifiers)) return
    if (!def.allowedTerrain.includes(region.terrain)) return
    if (
      def.requiredTech &&
      !useResearchStore.getState().completed.includes(def.requiredTech)
    ) {
      return
    }
    if (region.construction) return
    if (region.buildings.some((b) => b.id === buildingId)) return
    const { stockpile, gold } = usePlayerStore.getState()
    if (!canAffordCost(stockpile, gold, def.cost)) return

    const nextStock = { ...stockpile }
    for (const [g, v] of Object.entries(def.cost.goods)) {
      nextStock[g as GoodId] -= v ?? 0
    }
    usePlayerStore.setState({
      stockpile: nextStock,
      gold: gold - def.cost.gold,
    })
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

    const nextStock = { ...stockpile }
    for (const [g, v] of Object.entries(cost.goods)) {
      nextStock[g as GoodId] -= v ?? 0
    }
    usePlayerStore.setState({
      stockpile: nextStock,
      gold: gold - cost.gold,
    })
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

  trainArmy: (regionId) => {
    const { regions } = get()
    const region = regions[regionId]
    if (!region) return
    const { stockpile, gold } = usePlayerStore.getState()
    if (trainBlockReason(region, stockpile, gold) !== null) return

    usePlayerStore.setState({
      stockpile: { ...stockpile, iron: stockpile.iron - TRAIN_IRON_COST },
      gold: gold - TRAIN_GOLD_COST,
    })
    set({
      regions: {
        ...regions,
        [regionId]: {
          ...region,
          army: region.army + ARMY_PER_TRAIN,
          population: region.population - TRAIN_POP_COST,
        },
      },
    })
    get().pushLog(`Army trained in ${region.name} (+${ARMY_PER_TRAIN} strength).`)
  },

  attackRegion: (sourceId, targetId) => {
    const { regions, seed, tick } = get()
    const source = regions[sourceId]
    const target = regions[targetId]
    if (!source || !target) return
    if (source.ownerId !== PLAYER || source.army <= 0) return
    if (!target.hostile || !target.explored) return
    if (!source.neighborIds.includes(targetId)) return

    const roll = seededRoll(seed, tick, sourceId, targetId)
    const result = resolveAttack(
      source.army,
      target.garrison,
      roll,
      useResearchStore.getState().modifiers,
    )
    applyAttackResult(get, set, regions, sourceId, targetId, target.name, result)
  },

  moveUnit: (unitId, targetRegionId) => {
    const { regions, units } = get()
    const unit = units.find((u) => u.id === unitId)
    const target = regions[targetRegionId]
    if (!unit || !target) return
    // Order a destination anywhere on land — the unit walks a path there,
    // spending this tick's moves now and continuing next tick.
    const path = findPath(regions, unit.regionId, targetRegionId)
    if (!path) return

    const moved = { ...unit, path: [...path] }
    const list = Object.values({ ...regions })
    advanceUnit(moved, list)
    set({
      units: units.map((u) => (u.id === unitId ? moved : u)),
      regions: Object.fromEntries(list.map((r) => [r.id, r])),
    })
  },

  recruitUnit: (regionId, kind) => {
    const { regions, units } = get()
    const region = regions[regionId]
    const def = UNITS[kind]
    if (!region || region.ownerId !== PLAYER || !def) return
    if (
      def.requiredTech &&
      !useResearchStore.getState().completed.includes(def.requiredTech)
    ) {
      return
    }
    const { stockpile, gold } = usePlayerStore.getState()
    if (gold < def.cost.gold || stockpile.food < def.cost.food) return
    if (region.population <= def.cost.pop) return

    usePlayerStore.setState({
      gold: gold - def.cost.gold,
      stockpile: { ...stockpile, food: stockpile.food - def.cost.food },
    })
    const nextId = `u${Math.max(0, ...units.map((u) => Number(u.id.slice(1)))) + 1}`
    const unit: Unit = {
      id: nextId,
      kind,
      regionId,
      strength: def.strength,
      moves: def.moves,
      movesLeft: def.moves,
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

  attackWithUnit: (unitId, targetId) => {
    const { regions, units, seed, tick } = get()
    const unit = units.find((u) => u.id === unitId)
    const from = unit && regions[unit.regionId]
    const target = regions[targetId]
    if (!unit || !from || !target) return
    if (unit.movesLeft <= 0) return // attacking costs a move
    if (!target.hostile || !target.explored) return
    if (!from.neighborIds.includes(targetId)) return

    const roll = seededRoll(seed, tick, unitId, targetId)
    const result = resolveAttack(
      unit.strength,
      target.garrison,
      roll,
      useResearchStore.getState().modifiers,
    )

    if (result.victory) {
      const next = {
        ...regions,
        [targetId]: {
          ...target,
          ownerId: PLAYER,
          hostile: false,
          garrison: 0,
          population: 1,
          explored: true,
        },
      }
      const list = Object.values(next)
      revealAround(list)
      revealRadius(list, targetId, unit.sight)
      set({
        regions: Object.fromEntries(list.map((r) => [r.id, r])),
        units: units.map((u) =>
          u.id === unitId
            ? {
                ...u,
                regionId: targetId,
                strength: result.remainingArmy,
                movesLeft: u.movesLeft - 1,
                path: [],
              }
            : u,
        ),
      })
      get().pushLog(`${target.name} captured by your ${UNITS[unit.kind].name}!`)
    } else {
      set({
        units: units.filter((u) => u.id !== unitId),
        selectedUnitId:
          get().selectedUnitId === unitId ? null : get().selectedUnitId,
        regions: {
          ...regions,
          [targetId]: { ...target, garrison: result.remainingGarrison },
        },
      })
      get().pushLog(
        `Your ${UNITS[unit.kind].name} fell attacking ${target.name} (garrison now ${result.remainingGarrison}).`,
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
    saveGame(snapshot(), name)
    get().pushLog(`Game saved to "${name}".`)
  },

  loadSlot: (name) => {
    const saved = loadGame(name)
    if (!saved) return
    set(applySave(saved))
  },

  deleteSlot: (name) => {
    deleteSave(name)
  },
}))

function seededRoll(
  seed: number,
  tick: number,
  sourceId: string,
  targetId: string,
): number {
  return mulberry32(
    seed ^ (tick * 7919) ^
      (parseInt(sourceId.slice(1), 10) || 0) * 31 ^
      (parseInt(targetId.slice(1), 10) || 0),
  )()
}

type Get = () => GameState
type Set = (partial: Partial<GameState>) => void

function applyAttackResult(
  get: Get,
  set: Set,
  regions: Record<string, Region>,
  sourceId: string,
  targetId: string,
  targetName: string,
  result: { victory: boolean; remainingArmy: number; remainingGarrison: number },
): void {
  const source = regions[sourceId]
  const target = regions[targetId]
  if (result.victory) {
    const next = {
      ...regions,
      [sourceId]: { ...source, army: 0 },
      [targetId]: {
        ...target,
        ownerId: PLAYER,
        hostile: false,
        garrison: 0,
        army: result.remainingArmy,
        population: 2,
        explored: true,
      },
    }
    const list = Object.values(next)
    revealAround(list)
    set({ regions: Object.fromEntries(list.map((r) => [r.id, r])) })
    get().pushLog(
      `${targetName} conquered! Army holds with ${result.remainingArmy} strength.`,
    )
  } else {
    set({
      regions: {
        ...regions,
        [sourceId]: { ...source, army: 0 },
        [targetId]: { ...target, garrison: result.remainingGarrison },
      },
    })
    get().pushLog(
      `Attack on ${targetName} repelled. Garrison weakened to ${result.remainingGarrison}.`,
    )
  }
}
