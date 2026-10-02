import type { GoodId } from '../../types/game'
import { mulberry32 } from './world'

/** Ticks between event rolls. */
export const EVENT_INTERVAL = 30
/** Chance that a roll actually fires an event. */
export const EVENT_CHANCE = 0.5

export interface GameEvent {
  message: string
  /** Stockpile deltas (can be negative). */
  goods: Partial<Record<GoodId, number>>
  gold: number
  /** Multiplier applied to population of every owned region. */
  popMultiplier: number
  /** Instant science progress toward the active research. */
  science: number
}

const EVENTS: GameEvent[] = [
  {
    message: 'A bumper harvest fills the granaries. (+30 Food)',
    goods: { food: 30 },
    gold: 0,
    popMultiplier: 1,
    science: 0,
  },
  {
    message: 'A merchant caravan pays generous tolls. (+25 Gold)',
    goods: {},
    gold: 25,
    popMultiplier: 1,
    science: 0,
  },
  {
    message: 'Wandering scholars share their knowledge. (+15 Science)',
    goods: {},
    gold: 0,
    popMultiplier: 1,
    science: 15,
  },
  {
    message: 'A rich ore vein is uncovered. (+15 Iron)',
    goods: { iron: 15 },
    gold: 0,
    popMultiplier: 1,
    science: 0,
  },
  {
    message: 'Bandits raid the stores. (−15 Food, −10 Wood)',
    goods: { food: -15, wood: -10 },
    gold: 0,
    popMultiplier: 1,
    science: 0,
  },
  {
    message: 'A sickness spreads through the realm. (−8% population)',
    goods: {},
    gold: 0,
    popMultiplier: 0.92,
    science: 0,
  },
]

/** Deterministic per (seed, tick): returns an event or null. */
export function rollEvent(seed: number, tick: number): GameEvent | null {
  if (tick === 0 || tick % EVENT_INTERVAL !== 0) return null
  const rand = mulberry32(seed ^ (tick * 7919))
  if (rand() > EVENT_CHANCE) return null
  return EVENTS[Math.floor(rand() * EVENTS.length)]
}
