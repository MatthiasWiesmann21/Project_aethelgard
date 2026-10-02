import type { Era, LogEntry, Region, Unit } from '../types/game'
import type { Market, Stockpile } from './systems/economy'
import type { Modifiers } from '../types/game'
import { UNITS } from '../data/units'

/** Slot name used by the autosave and the legacy single save. */
export const AUTO_SLOT = 'auto'
const INDEX_KEY = 'aethelgard-saves-index'
const LEGACY_KEY = 'aethelgard-save-v1'
const slotKey = (name: string) => `aethelgard-save-${name}`
const SAVE_VERSION = 3
/** Autosave every N ticks. */
export const AUTOSAVE_INTERVAL = 10

export interface SaveData {
  version: number
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
    scienceRate: number
    goodsRate: Stockpile
  }
  research: {
    activeId: string | null
    progress: number
    completed: string[]
    queue: string[]
    modifiers: Modifiers
  }
}

export interface SaveMeta {
  name: string
  savedAt: number
  tick: number
  era: Era
}

/** A lone warrior at the capital — the starting scout. */
export function startingUnits(regions: Record<string, Region>): Unit[] {
  const capital = Object.values(regions).find((r) => r.isCapital)
  if (!capital) return []
  const def = UNITS.warrior
  return [
    {
      id: 'u0',
      kind: 'warrior',
      regionId: capital.id,
      strength: def.strength,
      moves: def.moves,
      movesLeft: def.moves,
      sight: def.sight,
      path: [],
    },
  ]
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

/** Fill in fields added in later save versions so old saves keep working. */
function migrate(data: SaveData): SaveData {
  for (const u of data.game.units ?? []) {
    u.path ??= []
  }
  for (const r of Object.values(data.game.regions)) {
    r.construction ??= null
  }
  data.research.queue ??= []
  data.version = SAVE_VERSION
  return data
}

export function saveGame(
  data: Omit<SaveData, 'version'>,
  slot: string = AUTO_SLOT,
): void {
  try {
    const payload: SaveData = { ...data, version: SAVE_VERSION }
    localStorage.setItem(slotKey(slot), JSON.stringify(payload))
    const meta: SaveMeta = {
      name: slot,
      savedAt: Date.now(),
      tick: data.game.tick,
      era: data.game.era,
    }
    writeIndex([
      meta,
      ...readIndex().filter((m) => m.name !== slot),
    ])
  } catch {
    // Storage unavailable or full — saving is best-effort.
  }
}

export function loadGame(slot: string = AUTO_SLOT): SaveData | null {
  try {
    let raw = localStorage.getItem(slotKey(slot))
    if (!raw && slot === AUTO_SLOT) {
      raw = localStorage.getItem(LEGACY_KEY)
    }
    if (!raw) return null
    const data = migrate(JSON.parse(raw) as SaveData)
    return data.version === SAVE_VERSION ? data : null
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
