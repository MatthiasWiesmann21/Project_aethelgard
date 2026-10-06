import { snapshotState, useGameStore } from '../store/useGameStore'
import { usePlayerStore } from '../store/usePlayerStore'
import { useResearchStore } from '../store/useResearchStore'
import { computeEconomyTick } from './systems/economy'
import { rollEvent } from './systems/events'
import { applyRaidLoot, tribeTick } from './systems/tribes'
import { advanceUnit } from './systems/world'
import {
  advanceEra,
  computeModifiers,
  computeResearchTick,
} from './systems/research'
import { HEAL_PER_TICK, unitMoves } from './systems/military'
import { AUTOSAVE_INTERVAL, saveGame } from './persistence'
import { ERA_LABEL } from '../data/techs'
import { BUILDINGS } from '../data/buildings'
import { UNITS } from '../data/units'
import type { GoodId, LogEntry, Region, Unit } from '../types/game'

/** Milliseconds per tick at 1x speed. One tick = one game month. */
export const TICK_MS = 1200

/**
 * Runs one simulation tick: economy (incl. unit upkeep) → tribes → event →
 * research → era, then constructions, unit upkeep (moves, healing, path
 * walking), and autosave. Pure systems produce patches; this function commits
 * them to the stores. Called by an interval in App.tsx — never inside a
 * render or animation frame.
 */
export function tickOnce(): void {
  const g = useGameStore.getState()
  const p = usePlayerStore.getState()
  const r = useResearchStore.getState()
  const nextTick = g.tick + 1
  const log: LogEntry[] = []
  const note = (message: string) => log.push({ tick: nextTick, message })

  const eco = computeEconomyTick(
    g.regions,
    g.market,
    g.tradePressure,
    p.stockpile,
    r.modifiers,
    g.seed,
    g.units,
  )

  const unitStrength: Record<string, number> = {}
  for (const u of g.units) {
    unitStrength[u.regionId] = (unitStrength[u.regionId] ?? 0) + u.strength
  }
  const tribes = tribeTick(g.regions, g.seed, nextTick, {
    garrisonBonus: r.modifiers.garrisonBonus,
    unitStrength,
  })
  const event = rollEvent(g.seed, nextTick)

  // ── Player: stockpile + gold (+ event deltas − raided loot) ─────────────
  let stockpile = { ...p.stockpile }
  for (const [good, delta] of Object.entries(eco.goodsDelta)) {
    const id = good as GoodId
    stockpile[id] = Math.max(0, stockpile[id] + delta)
  }
  if (event) {
    for (const [good, delta] of Object.entries(event.goods)) {
      const id = good as GoodId
      stockpile[id] = Math.max(0, stockpile[id] + delta)
    }
  }
  if (tribes) stockpile = applyRaidLoot(stockpile, tribes.stolen)
  const rawGold = p.gold + eco.goldDelta + (event?.gold ?? 0)
  // Unpaid upkeep: the treasury can't go negative, but troops stop healing.
  const unpaid = rawGold < 0
  usePlayerStore.setState({
    stockpile,
    gold: Math.max(0, rawGold),
    goldRate: eco.goldDelta,
    scienceRate: eco.scienceGain,
    goodsRate: eco.goodsDelta,
    breakdown: eco.breakdown,
  })

  // ── Research (queue auto-advances on completion) ────────────────────────
  const res = computeResearchTick(
    r.activeId,
    r.progress,
    r.completed,
    eco.scienceGain + (event?.science ?? 0),
    r.queue,
  )
  const newEra = advanceEra(g.era, res.completed)
  const modifiers = res.justCompleted.length
    ? computeModifiers(res.completed)
    : r.modifiers
  useResearchStore.setState({
    activeId: res.activeId,
    progress: res.progress,
    completed: res.completed,
    queue: res.queue,
    modifiers,
  })
  for (const tech of res.justCompleted) note(`Researched ${tech.name}.`)
  if (newEra !== g.era) note(`Your realm entered the ${ERA_LABEL[newEra]} era!`)

  // ── Regions: tribes → population (+ event) → construction ───────────────
  let regions: Record<string, Region> = { ...(tribes?.regions ?? g.regions) }
  for (const [id, pop] of Object.entries(eco.population)) {
    const region = regions[id]
    if (region?.ownerId === 'player') {
      regions[id] = { ...region, population: pop * (event?.popMultiplier ?? 1) }
    }
  }
  for (const region of Object.values(regions)) {
    if (region.ownerId !== 'player' || !region.construction) continue
    const left = region.construction.ticksLeft - 1
    if (left > 0) {
      regions[region.id] = {
        ...region,
        construction: { ...region.construction, ticksLeft: left },
      }
      continue
    }
    const def = BUILDINGS[region.construction.id]
    regions[region.id] = {
      ...region,
      buildings: [...region.buildings, { id: region.construction.id, level: 1 }],
      garrison: region.garrison + def.garrisonBonus,
      construction: null,
    }
    note(`${def.name} completed in ${region.name}.`)
  }

  // ── Units: moves refill, heal in friendly land (if paid), walk paths ────
  const units = g.units.map((u) => {
    const max = unitMoves(u, newEra, modifiers)
    const unit: Unit = { ...u, movesLeft: max }
    if (!unpaid && regions[unit.regionId]?.ownerId === 'player') {
      unit.strength = Math.min(
        UNITS[u.kind].strength,
        unit.strength + HEAL_PER_TICK,
      )
    }
    if (unit.path.length > 0) {
      regions = advanceUnit(unit, regions, g.seed, max)
    }
    return unit
  })

  if (event) note(event.message)
  for (const m of tribes?.messages ?? []) note(m)

  useGameStore.setState({
    tick: nextTick,
    era: newEra,
    regions,
    units,
    market: eco.market,
    tradePressure: eco.tradePressure,
    log: [...g.log, ...log].slice(-60),
  })

  if (nextTick % AUTOSAVE_INTERVAL === 0) saveGame(snapshotState())
}
