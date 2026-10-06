/** The game starts in 10,000 BC; one tick = one month. */
export const START_YEAR_BC = 10000
export const MONTHS_PER_YEAR = 12
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Calendar year for a tick — BC counts down, AD starts after 1 BC (no year 0). */
export function tickYear(tick: number): { year: number; era: 'BC' | 'AD' } {
  const bc = START_YEAR_BC - Math.floor(tick / MONTHS_PER_YEAR)
  return bc >= 1 ? { year: bc, era: 'BC' } : { year: 1 - bc, era: 'AD' }
}

/** e.g. "Mar 9,987 BC". */
export function formatDate(tick: number): string {
  const { year, era } = tickYear(tick)
  return `${MONTHS[tick % MONTHS_PER_YEAR]} ${year.toLocaleString('en-US')} ${era}`
}
