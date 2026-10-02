import { Delaunay } from 'd3-delaunay'
import type { Region, TerrainType, Vec2 } from '../../types/game'
import { isLand } from '../../data/terrain'
import { DEPOSITS, DEPOSIT_IDS } from '../../data/deposits'

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
      army: 0,
    }
  })

  assignTerrain(regions, rand)
  placeCapital(regions)
  assignDeposits(regions, rand)
  placeHostiles(regions, rand)
  assignNames(regions, rand)
  return Object.fromEntries(regions.map((r) => [r.id, r]))
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

  // A friendly neighbor starts explored, everything adjacent is revealed.
  revealAround(regions)
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

/** Owned regions plus their neighbors become explored. */
export function revealAround(regions: Region[]): void {
  for (const r of regions) {
    if (r.ownerId === 'player') revealRadius(regions, r.id, 1)
  }
}

/** Reveal every region within `radius` graph hops of `startId`
 * (BFS over adjacency — used for unit sight). Fog never re-closes. */
export function revealRadius(
  regions: Region[],
  startId: string,
  radius: number,
): void {
  const byId = new Map(regions.map((r) => [r.id, r]))
  const seen = new Set([startId])
  let frontier = [startId]
  for (let d = 0; d < radius; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const n of byId.get(id)?.neighborIds ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
  }
  for (const id of seen) {
    const r = byId.get(id)
    if (r) r.explored = true
  }
}

/** BFS shortest path through traversable land (non-hostile). Returns region
 * ids to walk *after* `fromId`, or null when unreachable. Unexplored regions
 * are walkable — that's what scouts are for. */
export function findPath(
  regions: Record<string, Region>,
  fromId: string,
  toId: string,
): string[] | null {
  if (fromId === toId) return []
  const target = regions[toId]
  if (!target || !isLand(target.terrain) || target.hostile) return null
  const prev = new Map<string, string>([[fromId, '']])
  const queue = [fromId]
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === toId) break
    for (const n of regions[cur]?.neighborIds ?? []) {
      if (prev.has(n)) continue
      const nr = regions[n]
      if (!nr || !isLand(nr.terrain) || nr.hostile) continue
      prev.set(n, cur)
      queue.push(n)
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
 * Walks a unit along its path, spending up to `movesLeft` steps and revealing
 * fog at each one. Mutates `regions` in place (the caller owns the copies).
 * Stops early when a waypoint is no longer traversable.
 */
export function advanceUnit(
  unit: { regionId: string; movesLeft: number; sight: number; path: string[] },
  regions: Region[],
): void {
  const byId = new Map(regions.map((r) => [r.id, r]))
  while (unit.movesLeft > 0 && unit.path.length > 0) {
    const next = byId.get(unit.path[0])
    if (!next || !isLand(next.terrain) || next.hostile) {
      unit.path = []
      return
    }
    unit.path.shift()
    unit.regionId = next.id
    unit.movesLeft -= 1
    revealRadius(regions, next.id, unit.sight)
  }
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
