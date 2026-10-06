import { Delaunay } from 'd3-delaunay'
import type { Region, TerrainType, Unit, Vec2 } from '../../types/game'
import { isLand, TERRAIN } from '../../data/terrain'
import { DEPOSITS, DEPOSIT_IDS } from '../../data/deposits'
import { RIVER_CHANCE, RIVER_EXTRA_MOVE_COST } from '../../data/rivers'

export const MAP_WIDTH = 1200
export const MAP_HEIGHT = 800

const COLS = 12
const ROWS = 8
const POINT_JITTER = 0.45
const LAND_RX = 0.44
const LAND_RY = 0.4

/** Deterministic seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NAME_A = [
  'Aeth', 'Bel', 'Cor', 'Dun', 'Eld', 'Fal', 'Gor', 'Hol', 'Kel', 'Mor',
  'Nor', 'Ost', 'Rav', 'Sel', 'Tor', 'Val', 'Wil', 'Yor', 'Ash', 'Bryn',
]
const NAME_B = [
  'gard', 'heim', 'ford', 'shire', 'wick', 'holm', 'dale', 'mark',
  'field', 'burgh', 'sten', 'moor', 'haven', 'crest', 'gate', 'mont',
]

export function generateWorld(seed: number): Record<string, Region> {
  const rand = mulberry32(seed)
  const cellW = MAP_WIDTH / COLS
  const cellH = MAP_HEIGHT / ROWS

  const sites: Vec2[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      sites.push({
        x: (col + 0.5) * cellW + (rand() - 0.5) * cellW * POINT_JITTER * 2,
        y: (row + 0.5) * cellH + (rand() - 0.5) * cellH * POINT_JITTER * 2,
      })
    }
  }

  const delaunay = Delaunay.from(
    sites,
    (p) => p.x,
    (p) => p.y,
  )
  const voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT])

  const regions: Region[] = sites.map((site, i) => {
    const cell = voronoi.cellPolygon(i)
    const polygon: Vec2[] = cell ? cell.map(([x, y]) => ({ x, y })) : [site]
    const neighborIds = [...delaunay.neighbors(i)].map((n) => `r${n}`)
    return {
      id: `r${i}`,
      name: '',
      polygon,
      centroid: site,
      terrain: 'plains',
      neighborIds,
      ownerId: null,
      hostile: false,
      explored: false,
      isCapital: false,
      population: 0,
      buildings: [],
      construction: null,
      deposit: null,
      garrison: 0,
    }
  })

  assignTerrain(regions, rand)
  placeCapital(regions)
  assignDeposits(regions, rand)
  placeHostiles(regions, rand)
  assignNames(regions, rand)
  // The capital and its neighbors start explored.
  return revealAround(Object.fromEntries(regions.map((r) => [r.id, r])))
}

/** Ellipse landmass: outside = water, land touching water = coast, plus
 * mountain/hill clusters and scattered forest inland. */
function assignTerrain(regions: Region[], rand: () => number): void {
  const cx = MAP_WIDTH / 2
  const cy = MAP_HEIGHT / 2

  for (const r of regions) {
    const dx = (r.centroid.x - cx) / (MAP_WIDTH * LAND_RX)
    const dy = (r.centroid.y - cy) / (MAP_HEIGHT * LAND_RY)
    r.terrain = dx * dx + dy * dy > 1 ? 'water' : 'plains'
  }

  // A couple of inland lakes.
  const land = regions.filter((r) => isLand(r.terrain))
  for (let i = 0; i < 2 && land.length; i++) {
    const lake = land[Math.floor(rand() * land.length)]
    if (lake) lake.terrain = 'water'
  }

  const landAdjacentTo = (r: Region, terrain: TerrainType) =>
    r.neighborIds.some(
      (id) => regions[Number(id.slice(1))].terrain === terrain,
    )

  // Mountain cluster: pick a seed, grow to 2-3 cells, hills ring them.
  const mountainSeed = land[Math.floor(rand() * land.length)]
  if (mountainSeed) {
    mountainSeed.terrain = 'mountain'
    const ring = mountainSeed.neighborIds
      .map((id) => regions[Number(id.slice(1))])
      .filter((r) => r.terrain === 'plains')
    for (const r of ring.slice(0, 1 + Math.floor(rand() * 2))) {
      r.terrain = 'mountain'
    }
  }
  for (const r of regions) {
    if (r.terrain === 'plains' && landAdjacentTo(r, 'mountain')) {
      r.terrain = 'hills'
    }
  }

  // Forest patches on remaining plains.
  for (const r of regions) {
    if (r.terrain === 'plains' && rand() < 0.38) r.terrain = 'forest'
  }

  // Coastline: land (except mountains) adjacent to water becomes coast.
  for (const r of regions) {
    if (
      r.terrain !== 'water' &&
      r.terrain !== 'mountain' &&
      r.neighborIds.some(
        (id) => regions[Number(id.slice(1))].terrain === 'water',
      )
    ) {
      r.terrain = 'coast'
    }
  }
}

/** Capital = land region farthest (in graph hops) from water; gets a farm. */
function placeCapital(regions: Region[]): void {
  const byId = new Map(regions.map((r) => [r.id, r]))
  const distToWater = new Map<string, number>()
  const queue: string[] = []
  for (const r of regions) {
    if (r.terrain === 'water' || r.terrain === 'coast') {
      distToWater.set(r.id, 0)
      queue.push(r.id)
    }
  }
  while (queue.length) {
    const cur = byId.get(queue.shift()!)!
    const d = distToWater.get(cur.id)!
    for (const n of cur.neighborIds) {
      if (!distToWater.has(n)) {
        distToWater.set(n, d + 1)
        queue.push(n)
      }
    }
  }

  let best: Region | null = null
  let bestScore = -Infinity
  for (const r of regions) {
    if (!isLand(r.terrain)) continue
    const score =
      (distToWater.get(r.id) ?? 0) * 10 + (r.terrain === 'plains' ? 3 : 0)
    if (score > bestScore) {
      bestScore = score
      best = r
    }
  }
  if (!best) return

  best.ownerId = 'player'
  best.isCapital = true
  best.population = 6
  best.garrison = 1
  if (best.terrain !== 'plains' && best.terrain !== 'coast') {
    best.terrain = 'plains'
  }
  best.buildings = [{ id: 'farm', level: 1 }]
}

/** ~30% of land regions get a resource deposit matching their terrain. */
function assignDeposits(regions: Region[], rand: () => number): void {
  for (const r of regions) {
    if (!isLand(r.terrain) || r.isCapital || rand() > 0.3) continue
    const candidates = DEPOSIT_IDS.filter((d) =>
      DEPOSITS[d].preferredTerrain.includes(r.terrain),
    )
    if (candidates.length) {
      r.deposit = candidates[Math.floor(rand() * candidates.length)]
    }
  }
}

/** A few land regions are held by hostile neutral forces — often guarding
 * deposits — and must be conquered rather than claimed. */
export const HOSTILE_REGION_COUNT = 4
export const HOSTILE_GARRISON_MIN = 8
export const HOSTILE_GARRISON_RANGE = 10

function placeHostiles(regions: Region[], rand: () => number): void {
  const withDeposit = regions.filter(
    (r) => isLand(r.terrain) && !r.isCapital && r.ownerId === null && r.deposit,
  )
  const plain = regions.filter(
    (r) => isLand(r.terrain) && !r.isCapital && r.ownerId === null && !r.deposit,
  )
  const shuffle = (arr: Region[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
  const picked = [
    ...shuffle(withDeposit),
    ...shuffle(plain),
  ].slice(0, HOSTILE_REGION_COUNT)
  for (const r of picked) {
    r.hostile = true
    r.garrison =
      HOSTILE_GARRISON_MIN + Math.floor(rand() * HOSTILE_GARRISON_RANGE)
    r.population = 0
  }
}

function assignNames(regions: Region[], rand: () => number): void {
  const used = new Set<string>()
  for (const r of regions) {
    let name = ''
    do {
      name =
        NAME_A[Math.floor(rand() * NAME_A.length)] +
        NAME_B[Math.floor(rand() * NAME_B.length)]
    } while (used.has(name))
    used.add(name)
    r.name = name
  }
  const capital = regions.find((r) => r.isCapital)
  if (capital) capital.name = 'Aethelgard'
}

/** Region ids within `radius` graph hops of `startId` (BFS over adjacency). */
function idsWithin(
  regions: Record<string, Region>,
  startId: string,
  radius: number,
): Set<string> {
  const seen = new Set([startId])
  let frontier = [startId]
  for (let d = 0; d < radius; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const n of regions[id]?.neighborIds ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
  }
  return seen
}

/** Copy-on-write: returns `regions` itself when nothing changes, otherwise a
 * new record where only newly explored regions are cloned. Never mutates. */
function markExplored(
  regions: Record<string, Region>,
  ids: Iterable<string>,
): Record<string, Region> {
  let next = regions
  for (const id of ids) {
    const r = regions[id]
    if (!r || r.explored) continue
    if (next === regions) next = { ...regions }
    next[id] = { ...r, explored: true }
  }
  return next
}

/** Owned regions plus their neighbors become explored. */
export function revealAround(
  regions: Record<string, Region>,
): Record<string, Region> {
  const ids = new Set<string>()
  for (const r of Object.values(regions)) {
    if (r.ownerId !== 'player') continue
    for (const id of idsWithin(regions, r.id, 1)) ids.add(id)
  }
  return markExplored(regions, ids)
}

/** Reveal every region within `radius` hops of `startId` (unit sight).
 * Fog never re-closes. Copy-on-write — the input is never mutated. */
export function revealRadius(
  regions: Record<string, Region>,
  startId: string,
  radius: number,
): Record<string, Region> {
  return markExplored(regions, idsWithin(regions, startId, radius))
}

/** Rivers are deterministic edges between land neighbors — computed from the
 * world seed, so they never need to be stored or migrated in saves. */
export function isRiver(
  seed: number,
  regions: Record<string, Region>,
  aId: string,
  bId: string,
): boolean {
  const a = regions[aId]
  const b = regions[bId]
  if (!a || !b || !isLand(a.terrain) || !isLand(b.terrain)) return false
  const [lo, hi] = aId < bId ? [aId, bId] : [bId, aId]
  const hash =
    (Number(lo.slice(1)) * 73856093) ^ (Number(hi.slice(1)) * 19349663)
  return mulberry32(seed ^ hash)() < RIVER_CHANCE
}

/** How many of the region's borders are rivers (drives food/gold/growth). */
export function riverCount(
  seed: number,
  region: Region,
  regions: Record<string, Region>,
): number {
  return region.neighborIds.filter((n) => isRiver(seed, regions, region.id, n))
    .length
}

export interface RiverEdge {
  a: string
  b: string
  /** Endpoints of the shared Voronoi border the river runs along. */
  from: Vec2
  to: Vec2
}

/** The border segment shared by two neighboring Voronoi cells. */
export function sharedBorder(a: Region, b: Region): [Vec2, Vec2] | null {
  const EPS = 0.01
  const shared: Vec2[] = []
  for (const p of a.polygon) {
    const onB = b.polygon.some(
      (q) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS,
    )
    const dup = shared.some(
      (q) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS,
    )
    if (onB && !dup) shared.push(p)
  }
  return shared.length >= 2 ? [shared[0], shared[1]] : null
}

/** Rivers never change after generation; cache per world. Keyed on the first
 * region's polygon array, which keeps its identity through state copies and
 * is replaced only when a new world (or a loaded save) is built. */
const riverCache = new WeakMap<Vec2[], { seed: number; edges: RiverEdge[] }>()

/** Deduped river edges with their border geometry (cached per world). */
export function riverEdges(
  seed: number,
  regions: Record<string, Region>,
): RiverEdge[] {
  const first = Object.values(regions)[0]
  const cached = first && riverCache.get(first.polygon)
  if (cached && cached.seed === seed) return cached.edges
  const edges: RiverEdge[] = []
  for (const r of Object.values(regions)) {
    for (const n of r.neighborIds) {
      if (r.id >= n || !isRiver(seed, regions, r.id, n)) continue
      const border = sharedBorder(r, regions[n])
      if (border) edges.push({ a: r.id, b: n, from: border[0], to: border[1] })
    }
  }
  if (first) riverCache.set(first.polygon, { seed, edges })
  return edges
}

/** Move points to step from `fromId` into the neighbor `toId`: terrain cost
 * plus a river-crossing surcharge. */
export function stepCost(
  seed: number,
  regions: Record<string, Region>,
  fromId: string,
  toId: string,
): number {
  const to = regions[toId]
  if (!to) return Infinity
  return (
    TERRAIN[to.terrain].moveCost +
    (isRiver(seed, regions, fromId, toId) ? RIVER_EXTRA_MOVE_COST : 0)
  )
}

function walkable(r: Region | undefined): r is Region {
  return !!r && isLand(r.terrain) && !r.hostile
}

/** Dijkstra cheapest path through traversable land (non-hostile), weighted by
 * `stepCost`. Returns region ids to walk *after* `fromId`, or null when
 * unreachable. Unexplored regions are walkable — that's what scouts are for. */
export function findPath(
  regions: Record<string, Region>,
  fromId: string,
  toId: string,
  seed = 0,
): string[] | null {
  if (fromId === toId) return []
  if (!walkable(regions[toId])) return null
  const dist = new Map<string, number>([[fromId, 0]])
  const prev = new Map<string, string>()
  const open = new Set([fromId])
  while (open.size) {
    let cur = ''
    let best = Infinity
    for (const id of open) {
      const d = dist.get(id)!
      if (d < best) {
        best = d
        cur = id
      }
    }
    open.delete(cur)
    if (cur === toId) break
    for (const n of regions[cur]?.neighborIds ?? []) {
      if (!walkable(regions[n])) continue
      const d = best + stepCost(seed, regions, cur, n)
      if (d < (dist.get(n) ?? Infinity)) {
        dist.set(n, d)
        prev.set(n, cur)
        open.add(n)
      }
    }
  }
  if (!prev.has(toId)) return null
  const path: string[] = []
  for (let cur = toId; cur !== fromId; cur = prev.get(cur)!) {
    path.unshift(cur)
  }
  return path
}

/**
 * Walks a unit along its path, paying `stepCost` per step and revealing fog.
 * Civ rule: a unit with its full allowance (`maxMoves`) may always take one
 * step, so slow units are never stuck in front of mountains or rivers.
 * Mutates `unit` (callers pass a fresh copy); returns the updated region
 * record (copy-on-write). Stops early when a waypoint is no longer walkable.
 */
export function advanceUnit(
  unit: Unit,
  regions: Record<string, Region>,
  seed: number,
  maxMoves: number,
): Record<string, Region> {
  let next = regions
  while (unit.movesLeft > 0 && unit.path.length > 0) {
    const target = next[unit.path[0]]
    if (!walkable(target)) {
      unit.path = []
      break
    }
    const cost = stepCost(seed, next, unit.regionId, target.id)
    if (unit.movesLeft < cost && unit.movesLeft < maxMoves) break
    unit.path = unit.path.slice(1)
    unit.regionId = target.id
    unit.movesLeft = Math.max(0, unit.movesLeft - cost)
    next = revealRadius(next, target.id, unit.sight)
  }
  return next
}

/** A region is claimable when explored, land, unowned, non-hostile, and next
 * to owned land. Hostile regions must be conquered instead. */
export function isClaimable(
  region: Region,
  regions: Record<string, Region>,
): boolean {
  if (
    region.ownerId !== null ||
    region.hostile ||
    !region.explored ||
    !isLand(region.terrain)
  ) {
    return false
  }
  return region.neighborIds.some(
    (id) => regions[id] && regions[id].ownerId === 'player',
  )
}
