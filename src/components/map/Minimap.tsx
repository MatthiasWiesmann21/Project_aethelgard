import { memo, useMemo, useRef } from 'react'
import type { Region, Unit } from '../../types/game'
import { TERRAIN } from '../../data/terrain'
import { UNITS } from '../../data/units'
import { MAP_HEIGHT, MAP_WIDTH } from '../../core/systems/world'

const W = 192
const H = (W * MAP_HEIGHT) / MAP_WIDTH
const FOG = '#DAD3C2'

interface Props {
  regions: Record<string, Region>
  units: Unit[]
  view: { x: number; y: number; w: number; h: number }
  /** Center the camera on map coordinates. */
  onJump: (x: number, y: number) => void
}

/** Whole-map overview: explored terrain, realm outline, units and the camera
 * viewport. Click or drag to move the camera. */
function Minimap({ regions, units, view, onJump }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const shapes = useMemo(
    () =>
      Object.values(regions).map((r) => (
        <polygon
          key={r.id}
          points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={r.explored ? (r.hostile ? '#E8A09A' : TERRAIN[r.terrain].fill) : FOG}
          stroke={r.ownerId === 'player' ? '#4F46E5' : 'none'}
          strokeWidth={r.ownerId === 'player' ? 6 : 0}
        />
      )),
    [regions],
  )

  const jump = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    onJump(
      ((clientX - rect.left) / rect.width) * MAP_WIDTH,
      ((clientY - rect.top) / rect.height) * MAP_HEIGHT,
    )
  }

  return (
    <div className="absolute bottom-4 right-16 z-10 overflow-hidden rounded-xl bg-white/90 p-1 shadow-lg ring-1 ring-black/5">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="block cursor-pointer rounded-lg"
        style={{ background: FOG }}
        onPointerDown={(e) => {
          dragging.current = true
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          jump(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (dragging.current) jump(e.clientX, e.clientY)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
      >
        {shapes}
        {units.map((u) => {
          const r = regions[u.regionId]
          return r ? (
            <circle
              key={u.id}
              cx={r.centroid.x}
              cy={r.centroid.y}
              r={14}
              fill={UNITS[u.kind].color}
              stroke="#fff"
              strokeWidth={4}
            />
          ) : null
        })}
        <rect
          x={view.x}
          y={view.y}
          width={view.w}
          height={view.h}
          fill="rgba(255,255,255,0.15)"
          stroke="#1E293B"
          strokeWidth={8}
          rx={10}
        />
      </svg>
    </div>
  )
}

export default memo(Minimap)
