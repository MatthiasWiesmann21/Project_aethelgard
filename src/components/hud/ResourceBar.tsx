import type { LucideIcon } from 'lucide-react'
import { Users } from 'lucide-react'
import { usePlayerStore } from '../../store/usePlayerStore'
import { useGameStore } from '../../store/useGameStore'
import { GOODS, GOOD_IDS } from '../../data/goods'
import { GOOD_ICONS, Coins, FlaskConical } from '../icons'

function fmt(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
}

function Pill({
  label,
  color,
  value,
  rate,
  breakdown,
  icon: Icon,
}: {
  label: string
  color: string
  value: string
  rate?: number
  /** Source → amount per month, shown in a hover popover. */
  breakdown?: Record<string, number>
  icon: LucideIcon
}) {
  const rows = breakdown
    ? Object.entries(breakdown)
        .filter(([, v]) => Math.abs(v) >= 0.05)
        .sort((a, b) => b[1] - a[1])
    : []
  return (
    <div className="group relative flex items-center gap-1.5 rounded-full bg-white px-3 py-1 shadow-sm">
      <Icon size={16} style={{ color }} />
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      {rate !== undefined && (
        <span
          className={`text-xs tabular-nums ${rate >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
        >
          {fmt(rate)}
        </span>
      )}
      {breakdown && (
      <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-52 -translate-x-1/2 rounded-xl bg-white p-3 text-xs shadow-xl ring-1 ring-slate-100 group-hover:block">
        <div className="mb-1.5 flex items-center justify-between font-bold text-slate-700">
          <span className="flex items-center gap-1.5">
            <Icon size={13} style={{ color }} />
            {label}
          </span>
          {rate !== undefined && (
            <span className={rate >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
              {fmt(rate)}/mo
            </span>
          )}
        </div>
        {rows.length === 0 && (
          <p className="text-slate-400">No income sources yet.</p>
        )}
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between py-0.5 tabular-nums">
            <span className="text-slate-500">{k}</span>
            <span className={v >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
              {fmt(v)}
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}

export default function ResourceBar() {
  const stockpile = usePlayerStore((s) => s.stockpile)
  const gold = usePlayerStore((s) => s.gold)
  const goldRate = usePlayerStore((s) => s.goldRate)
  const scienceRate = usePlayerStore((s) => s.scienceRate)
  const goodsRate = usePlayerStore((s) => s.goodsRate)
  const breakdown = usePlayerStore((s) => s.breakdown)
  const population = useGameStore((s) =>
    Object.values(s.regions).reduce(
      (sum, r) => sum + (r.ownerId === 'player' ? r.population : 0),
      0,
    ),
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill
        label="Gold"
        icon={Coins}
        color="#EAB308"
        value={Math.floor(gold).toString()}
        rate={goldRate}
        breakdown={breakdown.gold}
      />
      <Pill
        label="Population"
        icon={Users}
        color="#EC4899"
        value={Math.floor(population).toString()}
      />
      <Pill
        label="Science"
        icon={FlaskConical}
        color="#8B5CF6"
        value={scienceRate.toFixed(1)}
        breakdown={breakdown.science}
      />
      {GOOD_IDS.map((g) => (
        <Pill
          key={g}
          label={GOODS[g].label}
          icon={GOOD_ICONS[g]}
          color={GOODS[g].color}
          value={Math.floor(stockpile[g]).toString()}
          rate={goodsRate[g]}
          breakdown={g === 'food' ? breakdown.food : undefined}
        />
      ))}
    </div>
  )
}
