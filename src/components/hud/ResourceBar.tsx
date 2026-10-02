import type { LucideIcon } from 'lucide-react'
import { Users } from 'lucide-react'
import { usePlayerStore } from '../../store/usePlayerStore'
import { useGameStore } from '../../store/useGameStore'
import { GOODS, GOOD_IDS } from '../../data/goods'
import { GOOD_ICONS, Coins, FlaskConical } from '../icons'

function Pill({
  color,
  value,
  rate,
  icon: Icon,
}: {
  color: string
  value: string
  rate?: number
  icon: LucideIcon
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 shadow-sm">
      <Icon size={16} style={{ color }} />
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      {rate !== undefined && (
        <span
          className={`text-xs tabular-nums ${rate >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
        >
          {rate >= 0 ? '+' : ''}
          {rate.toFixed(1)}
        </span>
      )}
    </div>
  )
}

export default function ResourceBar() {
  const stockpile = usePlayerStore((s) => s.stockpile)
  const gold = usePlayerStore((s) => s.gold)
  const scienceRate = usePlayerStore((s) => s.scienceRate)
  const goodsRate = usePlayerStore((s) => s.goodsRate)
  const population = useGameStore((s) =>
    Object.values(s.regions).reduce(
      (sum, r) => sum + (r.ownerId === 'player' ? r.population : 0),
      0,
    ),
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill icon={Coins} color="#EAB308" value={Math.floor(gold).toString()} />
      <Pill
        icon={Users}
        color="#EC4899"
        value={Math.floor(population).toString()}
      />
      <Pill
        icon={FlaskConical}
        color="#8B5CF6"
        value={scienceRate.toFixed(1)}
      />
      {GOOD_IDS.map((g) => (
        <Pill
          key={g}
          icon={GOOD_ICONS[g]}
          color={GOODS[g].color}
          value={Math.floor(stockpile[g]).toString()}
          rate={goodsRate[g]}
        />
      ))}
    </div>
  )
}
