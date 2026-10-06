import type {
  EconomyBreakdown,
  Era,
  LogEntry,
  Modifiers,
  Region,
  Unit,
  UnitKind,
} from '../types/game'
import type { Market, Stockpile } from './systems/economy'
import { UNITS } from '../data/units'
import { generateWorld } from './systems/world'

/** Slot name used by the autosave and the legacy single save. */
export const AUTO_SLOT = 'auto'
const INDEX_KEY = 'aethelgard-saves-index'
const LEGACY_KEY = 'aethelgard-save-v1'
const slotKey = (name: string) => `aethelgard-save-${name}`
export const SAVE_VERSION = 4
/** Autosave every N ticks. */
export const AUTOSAVE_INTERVAL = 10

/** Full in-memory game state, as committed to / restored from the stores. */
export interface GameSnapshot {
  game: {
    tick: number
    era: Era
    seed: number
    regions: Record<string, Region>
    units: Unit[]
    market: Market
    tradePressure: Stockpile
    log: LogEntry[]
  }
  player: {
    stockpile: Stockpile
    gold: number
    goldRate: number
    scienceRate: number
    goodsRate: Stockpile
    breakdown: EconomyBreakdown
  }
  research: {
    activeId: string | null
    progress: number
    completed: string[]
    queue: string[]
    modifiers: Modifiers
  }
}

/** Region geometry is deterministic from the seed, so it isn't stored. */
type Geometry = 'polygon' | 'centroid' | 'neighborIds'
type StoredRegion = Omit<Region, Geometry> & Partial<Pick<Region, Geometry>>

interface SaveData {
  version: number
  game: Omit<GameSnapshot['game'], 'regions'> & {
    regions: Record<string, StoredRegion>
  }
  player: GameSnapshot['player']
  research: GameSnapshot['research']
}

export interface SaveMeta {
  name: string
  savedAt: number
  tick: number
  era: Era
}

function makeUnit(id: string, kind: UnitKind, regionId: string, strength?: number): Unit {
  const def = UNITS[kind]
  return {
    id,
    kind,
    regionId,
    strength: strength ?? def.strength,
    movesLeft: def.moves,
    sight: def.sight,
    path: [],
  }
}

/** A lone warrior at the capital — the starting scout. */
export function startingUnits(regions: Record<string, Region>): Unit[] {
  const capital = Object.values(regions).find((r) => r.isCapital)
  return capital ? [makeUnit('u0', 'warrior', capital.id)] : []
}

function readIndex(): SaveMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const list = raw ? (JSON.parse(raw) as SaveMeta[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeIndex(list: SaveMeta[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

export function listSaves(): SaveMeta[] {
  return readIndex().sort((a, b) => b.savedAt - a.savedAt)
}

function stripGeometry(regions: Record<string, Region>): Record<string, StoredRegion> {
  const out: Record<string, StoredRegion> = {}
  for (const [id, r] of Object.entries(regions)) {
    const { polygon: _p, centroid: _c, neighborIds: _n, ...rest } = r
    void _p
    void _c
    void _n
    out[id] = rest
  }
  return out
}

/** Rebuild region geometry from the seed; stored geometry (older saves) wins. */
export function hydrateRegions(
  seed: number,
  stored: Record<string, StoredRegion>,
): Record<string, Region> {
  const world = generateWorld(seed)
  const out: Record<string, Region> = {}
  for (const [id, r] of Object.entries(stored)) {
    const geo = world[id]
    out[id] = {
      ...r,
      polygon: r.polygon ?? geo?.polygon ?? [],
      centroid: r.centroid ?? geo?.centroid ?? { x: 0, y: 0 },
      neighborIds: r.neighborIds ?? geo?.neighborIds ?? [],
    }
  }
  return out
}

/** Loosely-typed shapes of fields that existed in older save versions. */
type LegacyRegion = StoredRegion & { army?: number }
type LegacyUnit = Partial<Unit> & { moves?: number }

/** Fill in / convert fields from older save versions so old saves keep
 * working: unit paths, construction, research queue, move bonus, and
 * region-bound armies (v≤3) become Soldier units. */
function migrate(data: SaveData): SaveData {
  const units = (data.game.units ?? []) as LegacyUnit[]
  const migratedUnits: Unit[] = units.map((u) => {
    const { moves: _m, ...rest } = u
    void _m
    return { ...makeUnit(rest.id ?? 'u0', rest.kind ?? 'warrior', rest.regionId ?? ''), ...rest, path: rest.path ?? [] }
  })
  let nextId =
    Math.max(-1, ...migratedUnits.map((u) => Number(u.id.slice(1)) || 0)) + 1
  for (const r of Object.values(data.game.regions) as LegacyRegion[]) {
    r.construction ??= null
    if (r.army && r.army > 0) {
      migratedUnits.push(makeUnit(`u${nextId++}`, 'soldier', r.id, r.army))
    }
    delete r.army
  }
  data.game.units = migratedUnits
  data.research.queue ??= []
  data.research.modifiers.unitMoveBonus ??= 0
  data.player.goldRate ??= 0
  data.player.breakdown ??= { gold: {}, food: {}, science: {} }
  data.version = SAVE_VERSION
  return data
}

export function saveGame(snapshot: GameSnapshot, slot: string = AUTO_SLOT): void {
  try {
    const payload: SaveData = {
      ...snapshot,
      game: { ...snapshot.game, regions: stripGeometry(snapshot.game.regions) },
      version: SAVE_VERSION,
    }
    localStorage.setItem(slotKey(slot), JSON.stringify(payload))
    const meta: SaveMeta = {
      name: slot,
      savedAt: Date.now(),
      tick: snapshot.game.tick,
      era: snapshot.game.era,
    }
    writeIndex([meta, ...readIndex().filter((m) => m.name !== slot)])
  } catch {
    // Storage unavailable or full — saving is best-effort.
  }
}

export function loadGame(slot: string = AUTO_SLOT): GameSnapshot | null {
  try {
    let raw = localStorage.getItem(slotKey(slot))
    if (!raw && slot === AUTO_SLOT) raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const data = migrate(JSON.parse(raw) as SaveData)
    return {
      game: {
        ...data.game,
        regions: hydrateRegions(data.game.seed, data.game.regions),
      },
      player: data.player,
      research: data.research,
    }
  } catch {
    return null
  }
}

export function deleteSave(slot: string): void {
  try {
    localStorage.removeItem(slotKey(slot))
    writeIndex(readIndex().filter((m) => m.name !== slot))
  } catch {
    // ignore
  }
}

export function clearSave(): void {
  deleteSave(AUTO_SLOT)
}
