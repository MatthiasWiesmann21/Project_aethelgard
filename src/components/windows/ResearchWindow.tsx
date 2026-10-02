import { useState } from 'react'
import { Check, FlaskConical, ListOrdered, Lock, X } from 'lucide-react'
import { useGameStore } from '../../store/useGameStore'
import { useResearchStore } from '../../store/useResearchStore'
import { ERA_LABEL, TECHS, TREES, TREE_IDS, techsOfTree } from '../../data/techs'
import { researchBlockReason } from '../../core/systems/research'
import Window from './Window'
import type { TechEffect, TechNode, TreeId } from '../../types/research'

function describeEffect(e: TechEffect): string {
  switch (e.kind) {
    case 'yieldBonus':
      return `${e.good === 'all' ? 'All goods' : e.good} yield ×${e.multiplier}`
    case 'goldYieldBonus':
      return `Gold income ×${e.multiplier}`
    case 'unlockBuilding':
      return `Unlocks ${e.building}`
    case 'claimCostMultiplier':
      return `Claim cost ×${e.multiplier}`
    case 'armyStrengthMultiplier':
      return `Army strength ×${e.multiplier}`
    case 'unlockUnit':
      return `Unlocks ${e.unit}`
    case 'garrisonBonus':
      return `+${e.amount} garrison`
    case 'popGrowthMultiplier':
      return `Pop growth ×${e.multiplier}`
    case 'scienceMultiplier':
      return `Science ×${e.multiplier}`
    case 'buildingSlots':
      return `+${e.amount} building slot`
  }
}

export default function ResearchWindow() {
  const [tree, setTree] = useState<TreeId>('society')
  const era = useGameStore((s) => s.era)
  const toggleWindow = useGameStore((s) => s.toggleWindow)
  const activeId = useResearchStore((s) => s.activeId)
  const progress = useResearchStore((s) => s.progress)
  const completed = useResearchStore((s) => s.completed)
  const queue = useResearchStore((s) => s.queue)
  const startResearch = useResearchStore((s) => s.startResearch)

  const activeTech = activeId ? TECHS[activeId] : null

  return (
    <Window
      title="Research"
      color="#0EA5E9"
      onClose={() => toggleWindow('research')}
    >
      {activeTech && (
        <div className="mb-3 rounded-xl bg-sky-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-800">
            <FlaskConical size={14} />
            Researching: {activeTech.name}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sky-100">
            <div
              className="h-full rounded-full bg-sky-500 transition-all"
              style={{
                width: `${Math.min(100, (progress / activeTech.cost) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-sky-600 tabular-nums">
            {progress.toFixed(1)} / {activeTech.cost} science
          </p>
        </div>
      )}

      {queue.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 p-2">
          <ListOrdered size={13} className="text-slate-400" />
          {queue.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => startResearch(id)}
              title="Remove from queue"
              className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-rose-50 hover:text-rose-600"
            >
              {TECHS[id]?.name ?? id}
              <X size={10} />
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 flex gap-1">
        {TREE_IDS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTree(t)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
              tree === t ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            style={tree === t ? { background: TREES[t].color } : undefined}
          >
            {TREES[t].label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {techsOfTree(tree).map((tech) => (
          <TechCard
            key={tech.id}
            tech={tech}
            state={
              completed.includes(tech.id)
                ? 'done'
                : activeId === tech.id
                  ? 'active'
                  : queue.includes(tech.id)
                    ? 'queued'
                    : researchBlockReason(tech, completed, era) === null
                      ? 'available'
                      : 'locked'
            }
            reason={researchBlockReason(tech, completed, era)}
            onStart={() => startResearch(tech.id)}
          />
        ))}
      </div>
    </Window>
  )
}

function TechCard({
  tech,
  state,
  reason,
  onStart,
}: {
  tech: TechNode
  state: 'done' | 'active' | 'queued' | 'available' | 'locked'
  reason: string | null
  onStart: () => void
}) {
  const border =
    state === 'done'
      ? 'border-emerald-300 bg-emerald-50'
      : state === 'active'
        ? 'border-amber-300 bg-amber-50'
        : state === 'queued'
          ? 'border-violet-300 bg-violet-50 cursor-pointer'
          : state === 'available'
            ? 'border-slate-200 hover:border-sky-300 hover:bg-sky-50 cursor-pointer'
            : 'border-slate-200 opacity-50'

  return (
    <button
      type="button"
      disabled={state !== 'available' && state !== 'queued'}
      onClick={onStart}
      className={`rounded-xl border p-3 text-left transition ${border}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">
          {tech.name}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5">
            {ERA_LABEL[tech.era]}
          </span>
          <span className="flex items-center gap-0.5 text-violet-600">
            <FlaskConical size={11} />
            {tech.cost}
          </span>
          {state === 'done' && <Check size={14} className="text-emerald-600" />}
          {state === 'queued' && (
            <ListOrdered size={13} className="text-violet-500" />
          )}
          {state === 'locked' && <Lock size={12} className="text-slate-400" />}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{tech.description}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {tech.effects.map((e, i) => (
          <span
            key={i}
            className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200"
          >
            {describeEffect(e)}
          </span>
        ))}
      </div>
      {state === 'locked' && reason && (
        <p className="mt-1 text-[11px] font-medium text-rose-500">{reason}</p>
      )}
    </button>
  )
}
