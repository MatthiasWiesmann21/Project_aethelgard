import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useGameStore } from '../../store/useGameStore'
import { DEPOSITS } from '../../data/deposits'
import { FOG_STROKE, TERRAIN, isLand } from '../../data/terrain'
import { UNITS } from '../../data/units'
import { MAP_HEIGHT, MAP_WIDTH, isClaimable } from '../../core/systems/world'
import { attackOdds, type AttackOdds } from '../../core/systems/military'
import { useResearchStore } from '../../store/useResearchStore'
import { ODDS_STROKE } from './oddsStyles'
import type { Region } from '../../types/game'

const FOG_FILL = '#DAD3C2'
const OWNER_STROKE = '#4F46E5'
const HOSTILE_STROKE = '#DC2626'
const SELECT_STROKE = '#F59E0B'
const MOVE_HINT = '#22D3EE'
const HOSTILE_TINT = '#E8A09A'

const MIN_VIEW_W = MAP_WIDTH / 6
/** Start slightly zoomed in so panning is meaningful. */
const START_VIEW_W = MAP_WIDTH / 1.7

interface View {
  x: number
  y: number
  w: number
  h: number
}

function clampView(v: View): View {
  const w = Math.min(Math.max(v.w, MIN_VIEW_W), MAP_WIDTH)
  const h = w * (MAP_HEIGHT / MAP_WIDTH)
  return {
    w,
    h,
    x: Math.min(Math.max(v.x, 0), MAP_WIDTH - w),
    y: Math.min(Math.max(v.y, 0), MAP_HEIGHT - h),
  }
}

/** Initial camera: zoomed in and centered on the capital (or map center). */
function capitalView(regions?: Record<string, Region>): View {
  const list = regions
    ? Object.values(regions)
    : Object.values(useGameStore.getState().regions)
  const capital = list.find((r) => r.isCapital)
  const w = START_VIEW_W
  const h = w * (MAP_HEIGHT / MAP_WIDTH)
  const cx = capital?.centroid.x ?? MAP_WIDTH / 2
  const cy = capital?.centroid.y ?? MAP_HEIGHT / 2
  return clampView({ w, h, x: cx - w / 2, y: cy - h / 2 })
}

export default function RegionMap() {
  const regions = useGameStore((s) => s.regions)
  const units = useGameStore((s) => s.units)
  const seed = useGameStore((s) => s.seed)
  const selectedRegionId = useGameStore((s) => s.selectedRegionId)
  const selectedUnitId = useGameStore((s) => s.selectedUnitId)
  const selectRegion = useGameStore((s) => s.selectRegion)
  const selectUnit = useGameStore((s) => s.selectUnit)
  const moveUnit = useGameStore((s) => s.moveUnit)
  const attackWithUnit = useGameStore((s) => s.attackWithUnit)

  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(() => capitalView())
  const [lastSeed, setLastSeed] = useState(seed)
  const dragRef = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null)
  const suppressClick = useRef(false)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)

  // Recenter the camera on the capital when a new map is generated.
  if (seed !== lastSeed) {
    setLastSeed(seed)
    setView(capitalView(regions))
  }

  const modifiers = useResearchStore((s) => s.modifiers)
  const selectedUnit = units.find((u) => u.id === selectedUnitId) ?? null
  // Reachable neighbors get a move hint; hostile neighbors show attack odds.
  const movableIds = new Set<string>()
  const attackOddsById = new Map<string, AttackOdds>()
  if (selectedUnit && selectedUnit.movesLeft > 0) {
    for (const n of regions[selectedUnit.regionId]?.neighborIds ?? []) {
      const nr = regions[n]
      if (!nr || !isLand(nr.terrain)) continue
      if (nr.hostile && nr.explored) {
        attackOddsById.set(
          n,
          attackOdds(selectedUnit.strength, nr.garrison, modifiers),
        )
      } else if (!nr.hostile) {
        movableIds.add(n)
      }
    }
  }

  // Center on the capital, zoomed in — on first render and after New Map.

  // Wheel zoom anchored at the cursor — must be a non-passive listener.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const mx = (e.clientX - rect.left) / rect.width
      const my = (e.clientY - rect.top) / rect.height
      setView((v) => {
        const wx = v.x + mx * v.w
        const wy = v.y + my * v.h
        const nw = v.w * (e.deltaY > 0 ? 1.2 : 1 / 1.2)
        return clampView({ w: nw, h: nw * (MAP_HEIGHT / MAP_WIDTH), x: wx - mx * nw, y: wy - my * nw * (MAP_HEIGHT / MAP_WIDTH) })
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  // WASD / arrow-key panning.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const step = view.w * 0.08
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
        ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
        ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
        ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
      }
      const dir = moves[e.key]
      if (dir) setView((v) => clampView({ ...v, x: v.x + dir[0] * step, y: v.y + dir[1] * step }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view.w])

  // RTS-style edge scrolling: hovering near the container edge pans the map.
  useEffect(() => {
    const timer = setInterval(() => {
      const p = pointerRef.current
      const wrap = wrapRef.current
      if (!p || !wrap || dragRef.current) return
      const rect = wrap.getBoundingClientRect()
      const EDGE = 28
      const relX = (p.x - rect.left) / rect.width
      const relY = (p.y - rect.top) / rect.height
      if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return
      const step = view.w * 0.015
      let dx = 0
      let dy = 0
      if (relX * rect.width < EDGE) dx = -step
      else if ((1 - relX) * rect.width < EDGE) dx = step
      if (relY * rect.height < EDGE) dy = -step
      else if ((1 - relY) * rect.height < EDGE) dy = step
      if (dx || dy) {
        setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }))
      }
    }, 33)
    return () => clearInterval(timer)
  }, [view.w])

  const zoomBy = (factor: number) =>
    setView((v) =>
      clampView({
        w: v.w * factor,
        h: v.h * factor,
        x: v.x + (v.w - v.w * factor) / 2,
        y: v.y + (v.h - v.h * factor) / 2,
      }),
    )

  const handleRegionClick = (r: Region) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (selectedUnit) {
      const from = regions[selectedUnit.regionId]
      const isNeighbor = from?.neighborIds.includes(r.id) ?? false
      if (isNeighbor && r.hostile && r.explored) {
        attackWithUnit(selectedUnit.id, r.id)
        return
      }
      if (isLand(r.terrain) && !r.hostile && r.id !== from?.id) {
        moveUnit(selectedUnit.id, r.id)
        return
      }
      selectUnit(null)
    }
    selectRegion(r.id)
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden"
      style={{ background: FOG_FILL }}
      onPointerMove={(e) => {
        pointerRef.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerLeave={() => {
        pointerRef.current = null
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="h-full w-full select-none"
        onPointerDown={(e) => {
          dragRef.current = { cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y }
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d || !svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const dx = ((e.clientX - d.cx) / rect.width) * view.w
          const dy = ((e.clientY - d.cy) / rect.height) * view.h
          if (Math.abs(e.clientX - d.cx) + Math.abs(e.clientY - d.cy) > 4) {
            suppressClick.current = true
          }
          setView((v) => clampView({ ...v, x: d.vx - dx, y: d.vy - dy }))
        }}
        onPointerUp={() => {
          dragRef.current = null
        }}
        onPointerLeave={() => {
          dragRef.current = null
        }}
      >
        {Object.values(regions).map((r) => {
          const t = TERRAIN[r.terrain]
          const points = r.polygon.map((p) => `${p.x},${p.y}`).join(' ')
          const owned = r.ownerId === 'player'
          const selected = r.id === selectedRegionId
          const claimable = r.explored && isClaimable(r, regions)
          const movable = movableIds.has(r.id)

          let fill = r.explored ? t.fill : FOG_FILL
          let stroke = r.explored ? t.stroke : FOG_STROKE
          let strokeWidth = 1.5
          if (r.explored && r.hostile) {
            fill = HOSTILE_TINT
            stroke = HOSTILE_STROKE
            strokeWidth = 2
          }
          if (owned) {
            stroke = OWNER_STROKE
            strokeWidth = 3
          }
          if (selected) {
            stroke = SELECT_STROKE
            strokeWidth = 3.5
          }
          if (movable && !r.hostile) {
            stroke = MOVE_HINT
            strokeWidth = 2.5
          }
          const odds = attackOddsById.get(r.id)
          if (odds) {
            stroke = ODDS_STROKE[odds]
            strokeWidth = 3
          }

          return (
            <g key={r.id}>
              <polygon
                points={points}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={claimable || movable ? '6 4' : undefined}
                strokeLinejoin="round"
                className="cursor-pointer transition-opacity hover:opacity-80"
                onClick={() => handleRegionClick(r)}
              />
              {r.explored && r.terrain !== 'water' && (
                <text
                  x={r.centroid.x}
                  y={r.centroid.y}
                  textAnchor="middle"
                  fontSize={10}
                  fill={owned ? '#312E81' : '#5B5647'}
                  fontWeight={owned ? 700 : 500}
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
                  fontSize={17}
                  className="pointer-events-none select-none"
                >
                  ★
                </text>
              )}
              {r.explored && r.deposit && (
                <text
                  x={r.centroid.x}
                  y={r.centroid.y - 8}
                  textAnchor="middle"
                  fontSize={13}
                  className="pointer-events-none select-none"
                >
                  {DEPOSITS[r.deposit].glyph}
                </text>
              )}
              {r.explored && r.hostile && (
                <text
                  x={r.centroid.x}
                  y={r.centroid.y + 13}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#991B1B"
                  fontWeight={700}
                  className="pointer-events-none select-none"
                >
                  ⚔{r.garrison}
                </text>
              )}
              {r.army > 0 && (
                <text
                  x={r.centroid.x}
                  y={r.centroid.y + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fill={OWNER_STROKE}
                  fontWeight={700}
                  className="pointer-events-none select-none"
                >
                  ⛨{r.army}
                </text>
              )}
            </g>
          )
        })}

        {/* Units — rendered after regions so they stay on top. */}
        {units.map((u) => {
          const region = regions[u.regionId]
          if (!region) return null
          const isSel = u.id === selectedUnitId
          return (
            <g
              key={u.id}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                if (!suppressClick.current) selectUnit(isSel ? null : u.id)
              }}
            >
              <circle
                cx={region.centroid.x + 12}
                cy={region.centroid.y + 10}
                r={10}
                fill={isSel ? MOVE_HINT : '#FFFFFF'}
                stroke={isSel ? '#0891B2' : OWNER_STROKE}
                strokeWidth={2}
              />
              <text
                x={region.centroid.x + 12}
                y={region.centroid.y + 14}
                textAnchor="middle"
                fontSize={11}
                className="pointer-events-none select-none"
              >
                {UNITS[u.kind].glyph}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.35)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-md transition hover:bg-slate-100"
          title="Zoom in"
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.35)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-md transition hover:bg-slate-100"
          title="Zoom out"
        >
          <Minus size={17} />
        </button>
      </div>
    </div>
  )
}
