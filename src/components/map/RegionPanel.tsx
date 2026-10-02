import {
  ChevronUp,
  Coins,
  Flag,
  Shield,
  Swords,
  Users,
  X,
} from 'lucide-react'
import { useGameStore } from '../../store/useGameStore'
import { usePlayerStore } from '../../store/usePlayerStore'
import { useResearchStore } from '../../store/useResearchStore'
import { BUILDINGS, MAX_BUILDING_LEVEL } from '../../data/buildings'
import { DEPOSITS } from '../../data/deposits'
import { GOODS, GOOD_IDS } from '../../data/goods'
import { TERRAIN } from '../../data/terrain'
import { TECHS } from '../../data/techs'
import {
  canAffordCost,
  claimCost,
  regionCapacity,
  regionMaxSlots,
  regionWorkersNeeded,
  upgradeCost,
} from '../../core/systems/economy'
import {
  ARMY_PER_TRAIN,
  attackOdds,
  ODDS_LABEL,
  TRAIN_GOLD_COST,
  TRAIN_IRON_COST,
  TRAIN_POP_COST,
  trainBlockReason,
} from '../../core/systems/military'
import { isClaimable } from '../../core/systems/world'
import { UNITS } from '../../data/units'
import { BUILDING_ICONS, GOOD_ICONS } from '../icons'
import { ODDS_STYLE } from './oddsStyles'
import type { BuildingCost, BuildingDef } from '../../types/buildings'
import type { TerrainType, UnitKind } from '../../types/game'

export default function RegionPanel() {
  const region = useGameStore((s) =>
    s.selectedRegionId ? s.regions[s.selectedRegionId] : null,
  )
  const regions = useGameStore((s) => s.regions)
  const selectRegion = useGameStore((s) => s.selectRegion)
  const claimRegion = useGameStore((s) => s.claimRegion)
  const constructBuilding = useGameStore((s) => s.constructBuilding)
  const upgradeBuilding = useGameStore((s) => s.upgradeBuilding)
  const trainArmy = useGameStore((s) => s.trainArmy)
  const attackRegion = useGameStore((s) => s.attackRegion)
  const units = useGameStore((s) => s.units)
  const selectedUnitId = useGameStore((s) => s.selectedUnitId)
  const selectUnit = useGameStore((s) => s.selectUnit)
  const recruitUnit = useGameStore((s) => s.recruitUnit)
  const stockpile = usePlayerStore((s) => s.stockpile)
  const gold = usePlayerStore((s) => s.gold)
  const modifiers = useResearchStore((s) => s.modifiers)
  const completed = useResearchStore((s) => s.completed)

  if (!region) return null

  const owned = region.ownerId === 'player'
  const maxSlots = regionMaxSlots(modifiers)
  const price = claimCost(modifiers)
  const claimable = isClaimable(region, regions)
  const workersNeeded = regionWorkersNeeded(region)
  const hostileTargets = region.neighborIds
    .map((id) => regions[id])
    .filter((n) => n && n.hostile && n.explored)
  const trainReason = trainBlockReason(region, stockpile, gold)
  const unitsHere = units.filter((u) => u.regionId === region.id)
  const capacity = regionCapacity(region)

  return (
    <div className="absolute right-4 top-4 z-20 max-h-[calc(100%-2rem)] w-80 overflow-y-auto rounded-2xl bg-white p-4 shadow-lg">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{region.name}</h2>
          <span
            className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
            style={{
              background: region.hostile
                ? '#DC2626'
                : TERRAIN[region.terrain].stroke,
            }}
          >
            {region.hostile
              ? 'Hostile Territory'
              : TERRAIN[region.terrain].label}
            {region.isCapital ? ' · Capital' : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={() => selectRegion(null)}
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
        >
          <X size={16} />
        </button>
      </div>

      {!region.explored && (
        <p className="text-sm text-slate-500">Unexplored territory.</p>
      )}

      {region.explored && (
        <>
          {region.deposit && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
              <span>{DEPOSITS[region.deposit].glyph}</span>
              {DEPOSITS[region.deposit].label}
            </div>
          )}

          <div className="mb-3 flex flex-wrap gap-3 text-sm text-slate-600">
            <span
              className="flex items-center gap-1"
              title={`Housing capacity: ${capacity}`}
            >
              <Users size={14} className="text-pink-500" />
              {Math.floor(region.population)}
              {owned && (
                <span className="text-xs text-slate-400">/{capacity}</span>
              )}
              {owned && workersNeeded > 0 && (
                <span className="text-xs text-slate-400">
                  ({Math.min(region.population, workersNeeded).toFixed(0)}/
                  {workersNeeded} working)
                </span>
              )}
            </span>
            {(owned || region.hostile) &&
              region.garrison + modifiers.garrisonBonus > 0 && (
                <span className="flex items-center gap-1">
                  <Shield size={14} className="text-violet-500" />
                  {region.hostile
                    ? region.garrison
                    : region.garrison + modifiers.garrisonBonus}
                </span>
              )}
            {owned && region.army > 0 && (
              <span className="flex items-center gap-1 font-semibold text-indigo-700">
                <Swords size={14} />
                {region.army}
              </span>
            )}
            {owned && (
              <span className="text-slate-500">
                Slots {region.buildings.length}/{maxSlots}
              </span>
            )}
          </div>

          {owned && (
            <>
              {region.construction && (
                <div className="mb-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800">
                  🔨 Building {BUILDINGS[region.construction.id].name} —{' '}
                  {region.construction.ticksLeft}{' '}
                  {region.construction.ticksLeft === 1 ? 'month' : 'months'}{' '}
                  left
                </div>
              )}
              {region.buildings.length > 0 && (
                <div className="mb-3 flex flex-col gap-1">
                  {region.buildings.map((b) => {
                    const def = BUILDINGS[b.id]
                    const Icon = BUILDING_ICONS[b.id]
                    const nextCost =
                      b.level < MAX_BUILDING_LEVEL
                        ? upgradeCost(def, b.level + 1)
                        : null
                    const canUp =
                      nextCost !== null &&
                      canAffordCost(stockpile, gold, nextCost)
                    return (
                      <div
                        key={b.id}
                        className="flex items-center justify-between rounded-lg bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700"
                      >
                        <span className="flex items-center gap-1.5">
                          <Icon size={13} />
                          {def.name}
                          <span className="text-indigo-400">Lv.{b.level}</span>
                        </span>
                        {nextCost && (
                          <button
                            type="button"
                            disabled={!canUp}
                            onClick={() => upgradeBuilding(region.id, b.id)}
                            title={costTitle(nextCost)}
                            className="flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-indigo-200 transition enabled:hover:bg-indigo-100 disabled:opacity-40"
                          >
                            <ChevronUp size={11} />
                            <CostInline cost={nextCost} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                Build
              </h3>
              <div className="mb-3 grid grid-cols-1 gap-1.5">
                {Object.values(BUILDINGS)
                  .filter(
                    (d) =>
                      !region.buildings.some((b) => b.id === d.id) &&
                      region.construction?.id !== d.id,
                  )
                  .map((d) => (
                    <BuildButton
                      key={d.id}
                      def={d}
                      terrain={region.terrain}
                      completed={completed}
                      slotsFull={
                        region.buildings.length +
                          (region.construction ? 1 : 0) >=
                        maxSlots
                      }
                      busy={region.construction !== null}
                      affordable={canAffordCost(stockpile, gold, d.cost)}
                      onBuild={() => constructBuilding(region.id, d.id)}
                    />
                  ))}
              </div>

              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                Military
              </h3>
              <button
                type="button"
                disabled={trainReason !== null}
                onClick={() => trainArmy(region.id)}
                title={
                  trainReason ??
                  `Train army: -${TRAIN_POP_COST} pop, -${TRAIN_IRON_COST} iron, -${TRAIN_GOLD_COST} gold → +${ARMY_PER_TRAIN} strength`
                }
                className="mb-1.5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 py-1.5 text-xs font-semibold text-white transition enabled:hover:bg-violet-600 disabled:opacity-40"
              >
                <Swords size={13} />
                Train army (+{ARMY_PER_TRAIN})
                <span className="flex items-center gap-1 text-violet-200">
                  <Users size={11} />
                  {TRAIN_POP_COST}
                  <Coins size={11} />
                  {TRAIN_GOLD_COST}
                </span>
              </button>

              {hostileTargets.length > 0 && (
                <div className="flex flex-col gap-1">
                  {hostileTargets.map((t) => {
                    const odds = attackOdds(region.army, t.garrison, modifiers)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={region.army <= 0}
                        onClick={() => attackRegion(region.id, t.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 py-1.5 text-xs font-semibold text-white transition enabled:hover:bg-rose-600 disabled:opacity-40"
                      >
                        <Swords size={13} />
                        Attack {t.name}
                        <span className="text-rose-200">⚔{t.garrison}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ODDS_STYLE[odds]}`}
                        >
                          {ODDS_LABEL[odds]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              <h3 className="mb-1.5 mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                Units
              </h3>
              {unitsHere.length > 0 && (
                <div className="mb-1.5 flex flex-col gap-1">
                  {unitsHere.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() =>
                        selectUnit(u.id === selectedUnitId ? null : u.id)
                      }
                      className={`flex items-center justify-between rounded-lg border px-2 py-1 text-xs transition ${
                        u.id === selectedUnitId
                          ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        {UNITS[u.kind].glyph} {UNITS[u.kind].name}
                        <span className="text-slate-400">⚔{u.strength}</span>
                      </span>
                      <span className="text-slate-400">
                        moves {u.movesLeft}/{u.moves}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(UNITS) as UnitKind[]).map((kind) => {
                  const d = UNITS[kind]
                  const techOk =
                    !d.requiredTech || completed.includes(d.requiredTech)
                  const afford =
                    gold >= d.cost.gold &&
                    stockpile.food >= d.cost.food &&
                    region.population > d.cost.pop
                  const reason = !techOk
                    ? `Requires ${TECHS[d.requiredTech!]?.name}`
                    : !afford
                      ? 'Not enough resources'
                      : null
                  return (
                    <button
                      key={kind}
                      type="button"
                      disabled={reason !== null}
                      onClick={() => recruitUnit(region.id, kind)}
                      title={
                        reason ??
                        `${d.name}: ⚔${d.strength}, ${d.moves} move, sight ${d.sight}`
                      }
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 transition enabled:hover:border-cyan-300 enabled:hover:bg-cyan-50 disabled:opacity-45"
                    >
                      <span>
                        {d.glyph} {d.name}
                      </span>
                      <span className="flex items-center gap-1 text-slate-400">
                        {d.cost.pop > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Users size={10} />
                            {d.cost.pop}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <Coins size={10} className="text-yellow-500" />
                          {d.cost.gold}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {region.hostile && (
            <p className="text-xs text-slate-500">
              Hostile forces hold this region. Station an army in an adjacent
              region and attack to conquer it.
            </p>
          )}

          {claimable && (
            <button
              type="button"
              disabled={gold < price}
              onClick={() => claimRegion(region.id)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-2 text-sm font-semibold text-white transition enabled:hover:bg-indigo-600 disabled:opacity-40"
            >
              <Flag size={15} />
              Claim region
              <span className="flex items-center gap-1 text-amber-200">
                <Coins size={13} />
                {price}
              </span>
            </button>
          )}

          {!owned && !claimable && !region.hostile && region.ownerId === null && (
            <p className="text-sm text-slate-500">
              Unclaimed — only regions bordering your realm can be claimed.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function costTitle(cost: BuildingCost): string {
  const parts = GOOD_IDS.filter((g) => cost.goods[g]).map(
    (g) => `${cost.goods[g]} ${GOODS[g].label}`,
  )
  if (cost.gold) parts.push(`${cost.gold} gold`)
  return `Upgrade cost: ${parts.join(', ')}`
}

function CostInline({ cost }: { cost: BuildingCost }) {
  return (
    <span className="flex items-center gap-1">
      {GOOD_IDS.filter((g) => cost.goods[g]).map((g) => {
        const GIcon = GOOD_ICONS[g]
        return (
          <span key={g} className="flex items-center gap-0.5">
            <GIcon size={10} style={{ color: GOODS[g].color }} />
            {cost.goods[g]}
          </span>
        )
      })}
      {cost.gold > 0 && (
        <span className="flex items-center gap-0.5">
          <Coins size={10} className="text-yellow-500" />
          {cost.gold}
        </span>
      )}
    </span>
  )
}

function BuildButton({
  def,
  terrain,
  completed,
  slotsFull,
  busy,
  affordable,
  onBuild,
}: {
  def: BuildingDef
  terrain: TerrainType
  completed: string[]
  slotsFull: boolean
  busy: boolean
  affordable: boolean
  onBuild: () => void
}) {
  const terrainOk = def.allowedTerrain.includes(terrain)
  const techOk = !def.requiredTech || completed.includes(def.requiredTech)
  const disabled = slotsFull || busy || !terrainOk || !techOk || !affordable

  let reason: string | null = null
  if (busy) reason = 'Construction already in progress'
  else if (slotsFull) reason = 'No free slots'
  else if (!terrainOk) reason = `Needs ${def.allowedTerrain.join('/')}`
  else if (!techOk) reason = `Requires ${TECHS[def.requiredTech!]?.name}`
  else if (!affordable) reason = 'Not enough resources'

  const Icon = BUILDING_ICONS[def.id]

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onBuild}
      title={reason ?? `${def.description} Needs ${def.workers} workers.`}
      className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-1.5 text-left text-sm transition enabled:hover:border-indigo-300 enabled:hover:bg-indigo-50 disabled:opacity-45"
    >
      <span className="flex items-center gap-2 font-medium text-slate-700">
        <Icon size={15} className="text-slate-500" />
        {def.name}
        <span className="text-[10px] text-slate-400">
          {def.workers}👤
        </span>
      </span>
      <CostInline cost={def.cost} />
    </button>
  )
}
