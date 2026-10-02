import type { AttackOdds } from '../../core/systems/military'

/** Chip/badge styling for the attack-odds label. */
export const ODDS_STYLE: Record<AttackOdds, string> = {
  victory: 'bg-emerald-100 text-emerald-700',
  risky: 'bg-amber-100 text-amber-700',
  defeat: 'bg-rose-100 text-rose-700',
}

/** Map stroke colors when a unit is selected and a hostile neighbor is in reach. */
export const ODDS_STROKE: Record<AttackOdds, string> = {
  victory: '#22C55E',
  risky: '#F59E0B',
  defeat: '#DC2626',
}
