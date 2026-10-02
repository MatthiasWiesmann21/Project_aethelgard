import { useGameStore } from '../store/useGameStore'
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
import { AUTOSAVE_INTERVAL, saveGame } from './persistence'
import { ERA_LABEL } from '../data/techs'
import { BUILDINGS } from '../data/buildings'
import { UNITS } from '../data/units'
import { HEAL_PER_TICK } from './systems/military'
import type { GoodId, Region, Unit } from '../types/game'

/** Milliseconds per tick at 1x speed. One tick = one game month. */
export const TICK_MS = 1200

/**
 * Runs one simulation tick: economy → tribes → event → research → era,
 * then constructions, unit upkeep (moves, healing, path walking), and
 * autosave. Pure systems produce patches; this function commits them to the
 * stores. Called by an interval in App.tsx — never inside a render or
 * animation frame.
 */
export function tickOnce(): void {
  const g = useGameStore.getState()
  const p = usePlayerStore.getState()
  const r = useResearchStore.getState()
  const nextTick = g.tick + 1

  const eco = computeEconomyTick(
    g.regions,
    g.market,
    g.tradePressure,
    p.stockpile,
    r.modifiers,
  )
  const tribes = tribeTick(g.regions, g.seed, nextTick)
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
  if (tribes) {
    stockpile = applyRaidLoot(stockpile, tribes.stolen)
  }
  usePlayerStore.setState({
    stockpile,
    gold: p.gold + eco.goldDelta + (event?.gold ?? 0),
    scienceRate: eco.scienceGain,
    goodsRate: eco.goodsDelta,
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
  useResearchStore.setState({
    activeId: res.activeId,
    progress: res.progress,
    completed: res.completed,
    queue: res.queue,
    modifiers: res.justCompleted.length
      ? computeModifiers(res.completed)
      : r.modifiers,
  })

  // ── Regions: tribes → population (+ event) → construction ───────────────
  const regions: Record<string, Region> = { ...(tribes?.regions ?? g.regions) }
  for (const [id, pop] of Object.entries(eco.population)) {
    const region = regions[id]
    if (region && region.ownerId === 'player') {
      regions[id] = {
        ...region,
        population: pop * (event?.popMultiplier ?? 1),
      }
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
    } else {
      const def = BUILDINGS[region.construction.id]
      regions[region.id] = {
        ...region,
        buildings: [
          ...region.buildings,
          { id: region.construction.id, level: 1 },
        ],
        garrison: region.garrison + def.garrisonBonus,
        construction: null,
      }
    }
  }

  // ── Units: moves refill, heal in friendly land, walk queued paths ───────
  const regionList = Object.values(regions)
  const units = g.units.map((u) => {
    const unit: Unit = { ...u, movesLeft: u.moves }
    const home = regions[unit.regionId]
    if (home?.ownerId === 'player') {
      unit.strength = Math.min(
        UNITS[u.kind].strength,
        unit.strength + HEAL_PER_TICK,
      )
    }
    if (unit.path.length > 0) advanceUnit(unit, regionList)
    return unit
  })

  // ── Log ────────────────────────────────────────────────────────────────
  const log = [...g.log]
  for (const tech of res.justCompleted) {
    log.push({ tick: nextTick, message: `Researched ${tech.name}.` })
  }
  if (newEra !== g.era) {
    log.push({ tick: nextTick, message: `Your realm entered the ${ERA_LABEL[newEra]} era!` })
  }
  for (const region of Object.values(regions)) {
    const prev = g.regions[region.id]
    if (prev?.construction && !region.construction) {
      log.push({
        tick: nextTick,
        message: `${BUILDINGS[prev.construction.id].name} completed in ${region.name}.`,
      })
    }
  }
  if (event) {
    log.push({ tick: nextTick, message: event.message })
  }
  if (tribes) {
    for (const m of tribes.messages) {
      log.push({ tick: nextTick, message: m })
    }
  }

  useGameStore.setState({
    tick: nextTick,
    era: newEra,
    regions: Object.fromEntries(regionList.map((r) => [r.id, r])),
    units,
    market: eco.market,
    tradePressure: eco.tradePressure,
    log: log.slice(-60),
  })

  if (nextTick % AUTOSAVE_INTERVAL === 0) {
    const g2 = useGameStore.getState()
    const p2 = usePlayerStore.getState()
    const r2 = useResearchStore.getState()
    saveGame({
      game: {
        tick: g2.tick,
        era: g2.era,
        seed: g2.seed,
        regions: g2.regions,
        units: g2.units,
        market: g2.market,
        tradePressure: g2.tradePressure,
        log: g2.log,
      },
      player: {
        stockpile: p2.stockpile,
        gold: p2.gold,
        scienceRate: p2.scienceRate,
        goodsRate: p2.goodsRate,
      },
      research: {
        activeId: r2.activeId,
        progress: r2.progress,
        completed: r2.completed,
        queue: r2.queue,
        modifiers: r2.modifiers,
      },
    })
  }
}
