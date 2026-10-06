import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useGameStore } from '../../store/useGameStore'
import { useResearchStore } from '../../store/useResearchStore'
import { TERRAIN, isLand } from '../../data/terrain'
import { UNITS } from '../../data/units'
import { RIVER_ATTACK_PENALTY } from '../../data/rivers'
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  isClaimable,
  isRiver,
  riverEdges,
} from '../../core/systems/world'
import { attackOdds, type AttackOdds } from '../../core/systems/military'
import type { Region, TerrainType, Unit } from '../../types/game'
import RegionShape, { FOG_FILL, MOVE_HINT, OWNER_STROKE } from './RegionShape'
import Minimap from './Minimap'

const RIVER_DARK = '#4AA3DF'
const RIVER_LIGHT = '#BFE6FB'
const PATH_STROKE = '#0EA5E9'

const MIN_VIEW_W = MAP_WIDTH / 6
/** Start slightly zoomed in so panning is meaningful. */
const START_VIEW_W = MAP_WIDTH / 1.7
/** Labels hide when zoomed out beyond this view width. */
const LABEL_MAX_VIEW_W = MAP_WIDTH * 0.8
/** Keyboard / edge pan speed: fraction of the view width per second. */
const PAN_SPEED = 0.9
const EDGE = 28
/** Max unit tokens fanned out per region before a "+n" badge. */
const MAX_TOKENS = 3

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

function centeredView(cx: number, cy: number, w: number): View {
  const h = w * (MAP_HEIGHT / MAP_WIDTH)
  return clampView({ w, h, x: cx - w / 2, y: cy - h / 2 })
}

/** Initial camera: zoomed in and centered on the capital (or map center). */
function capitalView(regions: Record<string, Region>): View {
  const capital = Object.values(regions).find((r) => r.isCapital)
  return centeredView(
    capital?.centroid.x ?? MAP_WIDTH / 2,
    capital?.centroid.y ?? MAP_HEIGHT / 2,
    START_VIEW_W,
  )
}

const KEY_DIRS: Record<string, [number, number]> = {
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1],
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
}

/** Map-space anchor of a unit token: fanned out right of the centroid. */
function tokenPos(region: Region, index: number): { x: number; y: number } {
  return { x: region.centroid.x + 14 + index * 9, y: region.centroid.y + 10 }
}

export default function RegionMap() {
  const regions = useGameStore((s) => s.regions)
  const units = useGameStore((s) => s.units)
  const seed = useGameStore((s) => s.seed)
  const selectedRegionId = useGameStore((s) => s.selectedRegionId)
  const selectedUnitId = useGameStore((s) => s.selectedUnitId)
  const selectUnit = useGameStore((s) => s.selectUnit)
  const modifiers = useResearchStore((s) => s.modifiers)

  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(() => capitalView(regions))
  const [lastSeed, setLastSeed] = useState(seed)
  const dragRef = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null)
  const suppressClick = useRef(false)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const keysRef = useRef(new Set<string>())

  // Recenter the camera on the capital when a new map is generated.
  if (seed !== lastSeed) {
    setLastSeed(seed)
    setView(capitalView(regions))
  }

  // ── Derived overlays (cheap, per render) ─────────────────────────────────
  const rivers = riverEdges(seed, regions)
  const selectedUnit = units.find((u) => u.id === selectedUnitId) ?? null
  const movableIds = new Set<string>()
  const oddsById = new Map<string, AttackOdds>()
  if (selectedUnit && selectedUnit.movesLeft > 0) {
    for (const n of regions[selectedUnit.regionId]?.neighborIds ?? []) {
      const nr = regions[n]
      if (!nr || !isLand(nr.terrain)) continue
      if (nr.hostile && nr.explored) {
        const penalty = isRiver(seed, regions, selectedUnit.regionId, n)
          ? RIVER_ATTACK_PENALTY
          : 1
        oddsById.set(n, attackOdds(selectedUnit.strength, nr.garrison, modifiers, penalty))
      } else if (!nr.hostile) {
        movableIds.add(n)
      }
    }
  }
  const unitsByRegion = new Map<string, Unit[]>()
  for (const u of units) {
    const list = unitsByRegion.get(u.regionId) ?? []
    list.push(u)
    unitsByRegion.set(u.regionId, list)
  }
  const showLabels = view.w <= LABEL_MAX_VIEW_W

  // ── Input ────────────────────────────────────────────────────────────────
  // Stable click handler reading fresh state — keeps RegionShape memoized.
  const onRegionClick = useCallback((id: string) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    const s = useGameStore.getState()
    const r = s.regions[id]
    const unit = s.units.find((u) => u.id === s.selectedUnitId)
    if (unit && r) {
      const from = s.regions[unit.regionId]
      if (from?.neighborIds.includes(id) && r.hostile && r.explored) {
        s.attackWithUnits([unit.id], id)
        return
      }
      if (isLand(r.terrain) && !r.hostile && id !== unit.regionId) {
        s.moveUnit(unit.id, id)
        return
      }
      s.selectUnit(null)
    }
    s.selectRegion(id)
  }, [])

  const jumpTo = useCallback((x: number, y: number) => {
    setView((v) => centeredView(x, y, v.w))
  }, [])

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
        const nw = v.w * (e.deltaY > 0 ? 1.15 : 1 / 1.15)
        const nh = nw * (MAP_HEIGHT / MAP_WIDTH)
        return clampView({ w: nw, h: nh, x: wx - mx * nw, y: wy - my * nh })
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  // Held keys tracked in a set; the animation loop below pans smoothly.
  useEffect(() => {
    const keys = keysRef.current
    const onDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const k = e.key.toLowerCase()
      if (KEY_DIRS[k]) {
        e.preventDefault()
        keys.add(k)
      }
    }
    const onUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    const clear = () => keys.clear()
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clear)
    }
  }, [])

  // One rAF loop for keyboard panning and RTS-style edge scrolling.
  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      let dx = 0
      let dy = 0
      for (const k of keysRef.current) {
        dx += KEY_DIRS[k][0]
        dy += KEY_DIRS[k][1]
      }
      const p = pointerRef.current
      const wrap = wrapRef.current
      if (p && wrap && !dragRef.current) {
        const rect = wrap.getBoundingClientRect()
        const rx = p.x - rect.left
        const ry = p.y - rect.top
        if (rx >= 0 && ry >= 0 && rx <= rect.width && ry <= rect.height) {
          if (rx < EDGE) dx -= 1
          else if (rect.width - rx < EDGE) dx += 1
          if (ry < EDGE) dy -= 1
          else if (rect.height - ry < EDGE) dy += 1
        }
      }
      if (dx || dy) {
        setView((v) => {
          const step = v.w * PAN_SPEED * dt
          return clampView({
            ...v,
            x: v.x + Math.sign(dx) * step,
            y: v.y + Math.sign(dy) * step,
          })
        })
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  const zoomBy = (factor: number) =>
    setView((v) => centeredView(v.x + v.w / 2, v.y + v.h / 2, v.w * factor))

  const terrains = Object.keys(TERRAIN) as TerrainType[]
  const owned = Object.values(regions).filter((r) => r.ownerId === 'player')

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
        <defs>
          {terrains.map((t) => (
            <radialGradient key={t} id={`grad-${t}`} cx="50%" cy="45%" r="70%">
              <stop offset="0%" stopColor={TERRAIN[t].highlight} />
              <stop offset="100%" stopColor={TERRAIN[t].fill} />
            </radialGradient>
          ))}
          <radialGradient id="grad-hostile" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#F6C6C1" />
            <stop offset="100%" stopColor="#E8A09A" />
          </radialGradient>
          <pattern id="fog-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="#E4DDCD" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="#CFC6B2" strokeWidth="3" />
          </pattern>
          <filter id="realm-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <marker id="path-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={PATH_STROKE} />
          </marker>
        </defs>

        {/* Soft shadow under the player's realm. */}
        <g filter="url(#realm-shadow)" opacity={0.35} className="pointer-events-none">
          {owned.map((r) => (
            <polygon
              key={r.id}
              points={r.polygon.map((p) => `${p.x + 3},${p.y + 5}`).join(' ')}
              fill="#1E1B4B"
            />
          ))}
        </g>

        {Object.values(regions).map((r) => (
          <RegionShape
            key={r.id}
            region={r}
            selected={r.id === selectedRegionId}
            claimable={r.explored && isClaimable(r, regions)}
            movable={movableIds.has(r.id)}
            odds={oddsById.get(r.id)}
            frontier={!r.explored && r.neighborIds.some((n) => regions[n]?.explored)}
            showLabels={showLabels}
            onClick={onRegionClick}
          />
        ))}

        {/* Rivers run along the shared border of two land regions. */}
        <g className="pointer-events-none" strokeLinecap="round">
          {rivers.map((e) => {
            const seen = regions[e.a]?.explored || regions[e.b]?.explored
            if (!seen) return null
            const d = `M ${e.from.x} ${e.from.y} L ${e.to.x} ${e.to.y}`
            return (
              <g key={`${e.a}-${e.b}`}>
                <path d={d} stroke={RIVER_DARK} strokeWidth={5} />
                <path d={d} stroke={RIVER_LIGHT} strokeWidth={1.8} />
              </g>
            )
          })}
        </g>

        {/* Move orders — animated dashed path with an arrowhead. */}
        {units
          .filter((u) => u.path.length > 0)
          .map((u) => {
            const pts = [u.regionId, ...u.path]
              .map((id) => regions[id])
              .filter((r): r is Region => !!r)
              .map((r) => tokenPos(r, 0))
            if (pts.length < 2) return null
            return (
              <path
                key={`path-${u.id}`}
                d={pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')}
                fill="none"
                stroke={PATH_STROKE}
                strokeWidth={2.5}
                strokeDasharray="7 5"
                markerEnd="url(#path-arrowhead)"
                opacity={u.id === selectedUnitId ? 1 : 0.45}
                className="path-anim pointer-events-none"
              />
            )
          })}

        {/* Unit tokens — fanned per region, health ring, smooth movement. */}
        {[...unitsByRegion.entries()].map(([regionId, list]) => {
          const region = regions[regionId]
          if (!region) return null
          const shown = list.slice(0, MAX_TOKENS)
          return shown.map((u, i) => {
            const def = UNITS[u.kind]
            const isSel = u.id === selectedUnitId
            const pct = Math.max(0, Math.min(1, u.strength / def.strength))
            const C = 2 * Math.PI * 12
            const pos = tokenPos(region, i)
            return (
              <g
                key={u.id}
                className="unit-token cursor-pointer"
                style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!suppressClick.current) selectUnit(isSel ? null : u.id)
                }}
              >
                {isSel && <circle r={16} fill={MOVE_HINT} opacity={0.35} className="unit-pulse" />}
                <circle r={10} fill="#FFFFFF" stroke={isSel ? '#0891B2' : def.color} strokeWidth={2.5} />
                <circle
                  r={12}
                  fill="none"
                  stroke={pct > 0.6 ? '#22C55E' : pct > 0.3 ? '#F59E0B' : '#EF4444'}
                  strokeWidth={2}
                  strokeDasharray={`${pct * C} ${C}`}
                  transform="rotate(-90)"
                />
                <text y={4} textAnchor="middle" fontSize={11} className="pointer-events-none select-none">
                  {def.glyph}
                </text>
                {i === shown.length - 1 && list.length > MAX_TOKENS && (
                  <g className="pointer-events-none">
                    <circle cx={10} cy={-9} r={6} fill={OWNER_STROKE} />
                    <text x={10} y={-6.5} textAnchor="middle" fontSize={7} fill="#FFF" fontWeight={700}>
                      +{list.length - MAX_TOKENS}
                    </text>
                  </g>
                )}
              </g>
            )
          })
        })}
      </svg>

      <Minimap regions={regions} units={units} view={view} onJump={jumpTo} />

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
