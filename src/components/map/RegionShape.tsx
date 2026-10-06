import { memo } from 'react'
import type { Region } from '../../types/game'
import type { AttackOdds } from '../../core/systems/military'
import { DEPOSITS } from '../../data/deposits'
import { FOG_STROKE, TERRAIN } from '../../data/terrain'
import { mulberry32 } from '../../core/systems/world'
import { ODDS_STROKE } from './oddsStyles'

export const FOG_FILL = '#DAD3C2'
export const OWNER_STROKE = '#4F46E5'
const HOSTILE_STROKE = '#DC2626'
const SELECT_STROKE = '#F59E0B'
export const MOVE_HINT = '#22D3EE'

/** Small deterministic decoration glyphs scattered inside a region. */
function decorGlyphs(region: Region): { glyph: string; dx: number; dy: number }[] {
  const glyphs =
    region.terrain === 'forest'
      ? ['🌲', '🌲', '🌳']
      : region.terrain === 'mountain'
        ? ['⛰']
        : region.terrain === 'hills'
          ? ['◠', '◠']
          : region.terrain === 'plains'
            ? ['ʷ']
            : []
  const rand = mulberry32(Number(region.id.slice(1)) * 97 + 13)
  return glyphs.map((glyph) => ({
    glyph,
    dx: (rand() - 0.5) * 34,
    dy: 14 + rand() * 10,
  }))
}

interface Props {
  region: Region
  selected: boolean
  claimable: boolean
  movable: boolean
  odds: AttackOdds | undefined
  /** Unexplored but bordering explored land — drawn as a hatched frontier. */
  frontier: boolean
  showLabels: boolean
  onClick: (id: string) => void
}

/** One map region (fill, border, decorations, labels). Memoized: with
 * copy-on-write region state only regions that changed re-render. */
function RegionShape({
  region: r,
  selected,
  claimable,
  movable,
  odds,
  frontier,
  showLabels,
  onClick,
}: Props) {
  const t = TERRAIN[r.terrain]
  const points = r.polygon.map((p) => `${p.x},${p.y}`).join(' ')
  const owned = r.ownerId === 'player'

  let fill = r.explored ? `url(#grad-${r.terrain})` : frontier ? 'url(#fog-hatch)' : FOG_FILL
  let stroke = r.explored ? t.stroke : FOG_STROKE
  let strokeWidth = 1.2
  if (r.explored && r.hostile) {
    fill = 'url(#grad-hostile)'
    stroke = HOSTILE_STROKE
    strokeWidth = 2
  }
  if (owned) {
    stroke = OWNER_STROKE
    strokeWidth = 2.6
  }
  if (movable) {
    stroke = MOVE_HINT
    strokeWidth = 2.5
  }
  if (odds) {
    stroke = ODDS_STROKE[odds]
    strokeWidth = 3
  }
  if (selected) {
    stroke = SELECT_STROKE
    strokeWidth = 3.5
  }

  return (
    <g>
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={claimable || movable ? '6 4' : undefined}
        strokeLinejoin="round"
        className={`region-shape cursor-pointer ${
          r.explored && r.terrain === 'water' ? 'water-shimmer' : ''
        }`}
        onClick={() => onClick(r.id)}
      />
      {owned && (
        <polygon
          points={points}
          fill={OWNER_STROKE}
          fillOpacity={0.08}
          className="pointer-events-none"
        />
      )}
      {r.explored &&
        decorGlyphs(r).map((d, i) => (
          <text
            key={i}
            x={r.centroid.x + d.dx}
            y={r.centroid.y + d.dy}
            textAnchor="middle"
            fontSize={9}
            opacity={0.5}
            className="pointer-events-none select-none"
          >
            {d.glyph}
          </text>
        ))}
      {r.explored && r.terrain !== 'water' && showLabels && (
        <text
          x={r.centroid.x}
          y={r.centroid.y + 3}
          textAnchor="middle"
          fontSize={10}
          fill={owned ? '#312E81' : '#4B4637'}
          fontWeight={owned ? 700 : 500}
          stroke="#FFFFFF"
          strokeWidth={2.5}
          strokeOpacity={0.6}
          paintOrder="stroke"
          className="pointer-events-none select-none"
        >
          {r.name}
        </text>
      )}
      {r.isCapital && (
        <text
          x={r.centroid.x}
          y={r.centroid.y - 9}
          textAnchor="middle"
          fontSize={16}
          className="pointer-events-none select-none"
        >
          ★
        </text>
      )}
      {r.explored && r.deposit && (
        <text
          x={r.centroid.x + (r.isCapital ? 16 : 0)}
          y={r.centroid.y - 9}
          textAnchor="middle"
          fontSize={12}
          className="pointer-events-none select-none"
        >
          {DEPOSITS[r.deposit].glyph}
        </text>
      )}
      {r.explored && r.hostile && (
        <g className="pointer-events-none select-none">
          <rect
            x={r.centroid.x - 15}
            y={r.centroid.y + 7}
            width={30}
            height={14}
            rx={7}
            fill="#FEE2E2"
            stroke={HOSTILE_STROKE}
            strokeWidth={1}
          />
          <text
            x={r.centroid.x}
            y={r.centroid.y + 17.5}
            textAnchor="middle"
            fontSize={10}
            fill="#991B1B"
            fontWeight={700}
          >
            🛡{r.garrison}
          </text>
        </g>
      )}
      {r.construction && (
        <text
          x={r.centroid.x - 16}
          y={r.centroid.y - 9}
          textAnchor="middle"
          fontSize={11}
          className="pointer-events-none select-none"
        >
          🔨
        </text>
      )}
    </g>
  )
}

export default memo(RegionShape)
