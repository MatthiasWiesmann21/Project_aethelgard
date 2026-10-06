import type { LucideIcon } from 'lucide-react'
import {
  Coins,
  Compass,
  Flag,
  FlaskConical,
  Swords,
  Users,
  Wheat,
} from 'lucide-react'
import { useGameStore } from '../../store/useGameStore'
import { usePlayerStore } from '../../store/usePlayerStore'
import { useResearchStore } from '../../store/useResearchStore'
import { isClaimable } from '../../core/systems/world'
import {
  ownedRegions,
  regionCapacity,
  regionWorkersNeeded,
} from '../../core/systems/economy'

type Severity = 'info' | 'warning' | 'critical'

interface Alert {
  id: string
  icon: LucideIcon
  label: string
  severity: Severity
  onClick?: () => void
}

const SEVERITY_STYLE: Record<Severity, string> = {
  info: 'bg-white text-sky-600 ring-sky-200',
  warning: 'bg-amber-50 text-amber-600 ring-amber-300',
  critical: 'bg-rose-50 text-rose-600 ring-rose-400 animate-pulse',
}

/** HOI4-style alert icons: persistent, state-derived, clickable. */
export default function AlertBar() {
  const regions = useGameStore((s) => s.regions)
  const units = useGameStore((s) => s.units)
  const stockpile = usePlayerStore((s) => s.stockpile)
  const goodsRate = usePlayerStore((s) => s.goodsRate)
  const gold = usePlayerStore((s) => s.gold)
  const goldRate = usePlayerStore((s) => s.goldRate)
  const activeId = useResearchStore((s) => s.activeId)
  const selectRegion = useGameStore((s) => s.selectRegion)
  const selectUnit = useGameStore((s) => s.selectUnit)
  const toggleWindow = useGameStore((s) => s.toggleWindow)

  const alerts: Alert[] = []
  const owned = ownedRegions(regions)

  if (!activeId) {
    alerts.push({
      id: 'no-research',
      icon: FlaskConical,
      label: 'No research selected — open the research tree',
      severity: 'info',
      onClick: () => toggleWindow('research'),
    })
  }

  if (goodsRate.food < 0 && stockpile.food < 10) {
    alerts.push({
      id: 'starving',
      icon: Wheat,
      label: 'Food shortage — population growth has halted',
      severity: 'critical',
    })
  } else if (stockpile.food < 15 || goodsRate.food < 0) {
    alerts.push({
      id: 'low-food',
      icon: Wheat,
      label: 'Food is running low — build farms or buy food',
      severity: 'warning',
    })
  }

  if (goldRate < 0 && gold < Math.max(5, -goldRate * 3)) {
    alerts.push({
      id: 'treasury',
      icon: Coins,
      label:
        gold < 1
          ? 'Treasury empty — unit upkeep unpaid, troops will not heal'
          : 'Treasury running dry — upkeep exceeds income',
      severity: gold < 1 ? 'critical' : 'warning',
      onClick: () => toggleWindow('market'),
    })
  }

  const understaffed = owned.find(
    (r) => regionWorkersNeeded(r) > Math.floor(r.population),
  )
  if (understaffed) {
    alerts.push({
      id: 'understaffed',
      icon: Users,
      label: `${understaffed.name} lacks workers — buildings understaffed`,
      severity: 'warning',
      onClick: () => selectRegion(understaffed.id),
    })
  }

  const crowded = owned.find(
    (r) => r.population >= regionCapacity(r) - 0.5 && r.population >= 5,
  )
  if (crowded) {
    alerts.push({
      id: 'crowded',
      icon: Users,
      label: `${crowded.name} is at housing capacity — build a Granary or expand`,
      severity: 'info',
      onClick: () => selectRegion(crowded.id),
    })
  }

  const idleUnit = units.find((u) => u.movesLeft > 0 && u.path.length === 0)
  if (idleUnit) {
    alerts.push({
      id: 'idle-unit',
      icon: Compass,
      label: 'Idle units — select a unit and scout the fog',
      severity: 'info',
      onClick: () => selectUnit(idleUnit.id),
    })
  }

  const claimable = Object.values(regions).find((r) =>
    isClaimable(r, regions),
  )
  if (claimable) {
    alerts.push({
      id: 'claimable',
      icon: Flag,
      label: `${claimable.name} can be claimed — expand your realm`,
      severity: 'info',
      onClick: () => selectRegion(claimable.id),
    })
  }

  const hostileBorder = Object.values(regions).find(
    (r) =>
      r.hostile &&
      r.explored &&
      r.neighborIds.some((id) => regions[id]?.ownerId === 'player'),
  )
  if (hostileBorder) {
    alerts.push({
      id: 'hostile-border',
      icon: Swords,
      label: `Hostile forces in ${hostileBorder.name} threaten your borders`,
      severity: 'warning',
      onClick: () => selectRegion(hostileBorder.id),
    })
  }

  if (alerts.length === 0) return null

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-20 flex -translate-x-1/2 gap-2">
      {alerts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={a.onClick}
          title={a.label}
          className={`flex h-9 w-9 items-center justify-center rounded-full shadow-md ring-2 transition hover:scale-110 ${SEVERITY_STYLE[a.severity]}`}
        >
          <a.icon size={17} />
        </button>
      ))}
    </div>
  )
}
