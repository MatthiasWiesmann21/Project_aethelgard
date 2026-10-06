import { describe, expect, it } from 'vitest'
import {
  generateWorld,
  isClaimable,
  findPath,
  isRiver,
  riverEdges,
  advanceUnit,
  revealRadius,
  stepCost,
} from './world'
import { isLand, TERRAIN } from '../../data/terrain'
import { RIVER_EXTRA_MOVE_COST } from '../../data/rivers'
import type { Region, TerrainType, Unit } from '../../types/game'

function makeRegion(id: string, terrain: TerrainType, neighborIds: string[]): Region {
  return {
    id,
    name: id,
    polygon: [],
    centroid: { x: 0, y: 0 },
    terrain,
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
}

function makeUnit(regionId: string, path: string[], movesLeft: number): Unit {
  return { id: 'u1', kind: 'warrior', regionId, strength: 6, movesLeft, sight: 1, path }
}

/** First seed (from 0) for which `pred` holds. */
function findSeed(pred: (seed: number) => boolean): number {
  for (let s = 0; s < 10_000; s++) if (pred(s)) return s
  throw new Error('no seed found')
}

describe('generateWorld', () => {
  it('is deterministic for the same seed', () => {
    const a = generateWorld(42)
    const b = generateWorld(42)
    expect(Object.keys(a)).toEqual(Object.keys(b))
    for (const id of Object.keys(a)) {
      expect(a[id].terrain).toBe(b[id].terrain)
      expect(a[id].name).toBe(b[id].name)
      expect(a[id].polygon).toEqual(b[id].polygon)
    }
  })

  it('produces symmetric adjacency', () => {
    const regions = generateWorld(7)
    for (const r of Object.values(regions)) {
      for (const n of r.neighborIds) {
        expect(regions[n].neighborIds).toContain(r.id)
      }
    }
  })

  it('places an owned, explored capital on land', () => {
    const regions = generateWorld(123)
    const capitals = Object.values(regions).filter((r) => r.isCapital)
    expect(capitals).toHaveLength(1)
    const cap = capitals[0]
    expect(cap.ownerId).toBe('player')
    expect(cap.explored).toBe(true)
    expect(isLand(cap.terrain)).toBe(true)
    expect(cap.population).toBeGreaterThan(0)
  })

  it('reveals neighbors of owned regions and makes them claimable', () => {
    const regions = generateWorld(99)
    const claimable = Object.values(regions).filter((r) =>
      isClaimable(r, regions),
    )
    expect(claimable.length).toBeGreaterThan(0)
    for (const r of claimable) {
      expect(r.explored).toBe(true)
      expect(isLand(r.terrain)).toBe(true)
    }
  })

  it('keeps water unclaimable', () => {
    const regions = generateWorld(5)
    for (const r of Object.values(regions)) {
      if (r.terrain === 'water') {
        expect(isClaimable(r, regions)).toBe(false)
        expect(r.ownerId).toBeNull()
      }
    }
  })
})

describe('findPath', () => {
  it('finds a path between adjacent land regions', () => {
    const regions = generateWorld(42)
    const capital = Object.values(regions).find((r) => r.isCapital)!
    const landNeighbor = capital.neighborIds
      .map((id) => regions[id])
      .find((r) => isLand(r.terrain) && !r.hostile)
    expect(landNeighbor).toBeDefined()
    expect(findPath(regions, capital.id, landNeighbor!.id)).toEqual([
      landNeighbor!.id,
    ])
  })

  it('rejects water and hostile destinations', () => {
    const regions = generateWorld(42)
    const capital = Object.values(regions).find((r) => r.isCapital)!
    const water = Object.values(regions).find((r) => r.terrain === 'water')
    if (water) {
      expect(findPath(regions, capital.id, water.id)).toBeNull()
    }
    const hostile = Object.values(regions).find((r) => r.hostile)
    if (hostile) {
      expect(findPath(regions, capital.id, hostile.id)).toBeNull()
    }
  })

  it('returns an empty path for the same region', () => {
    const regions = generateWorld(42)
    const capital = Object.values(regions).find((r) => r.isCapital)!
    expect(findPath(regions, capital.id, capital.id)).toEqual([])
  })
})

describe('rivers', () => {
  it('is deterministic and symmetric', () => {
    const regions = generateWorld(42)
    const [a, b] = Object.keys(regions)
    expect(isRiver(42, regions, a, b)).toBe(isRiver(42, regions, b, a))
  })

  it('only spans land-to-land edges and runs along the shared border', () => {
    const regions = generateWorld(42)
    const edges = riverEdges(42, regions)
    expect(edges.length).toBeGreaterThan(0)
    for (const e of edges) {
      expect(isLand(regions[e.a].terrain)).toBe(true)
      expect(isLand(regions[e.b].terrain)).toBe(true)
      expect(regions[e.a].neighborIds).toContain(e.b)
      // Both endpoints are vertices of both polygons.
      for (const p of [e.from, e.to]) {
        for (const id of [e.a, e.b]) {
          expect(
            regions[id].polygon.some(
              (q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01,
            ),
          ).toBe(true)
        }
      }
    }
  })

  it('caches edges per world', () => {
    const regions = generateWorld(42)
    expect(riverEdges(42, regions)).toBe(riverEdges(42, { ...regions }))
  })

  it('crossing a river adds to the step cost', () => {
    const regions = {
      a: makeRegion('a', 'plains', ['b']),
      b: makeRegion('b', 'plains', ['a']),
    }
    const seed = findSeed((s) => isRiver(s, regions, 'a', 'b'))
    expect(stepCost(seed, regions, 'a', 'b')).toBe(
      TERRAIN.plains.moveCost + RIVER_EXTRA_MOVE_COST,
    )
  })
})

describe('movement', () => {
  // a ─ m(mountain) ─ d
  // └── b ── c ─────┘   (plains everywhere else)
  const world = {
    a: makeRegion('a', 'plains', ['m', 'b']),
    m: makeRegion('m', 'mountain', ['a', 'd']),
    b: makeRegion('b', 'plains', ['a', 'c']),
    c: makeRegion('c', 'plains', ['b', 'd']),
    d: makeRegion('d', 'plains', ['m', 'c']),
  }
  const noRivers = findSeed((s) =>
    Object.values(world).every((r) => r.neighborIds.every((n) => !isRiver(s, world, r.id, n))),
  )

  it('pathfinding prefers the cheapest route over the shortest', () => {
    // via mountain: 3 + 1 = 4; around: 1 + 1 + 1 = 3
    expect(findPath(world, 'a', 'd', noRivers)).toEqual(['b', 'c', 'd'])
  })

  it('a unit with full moves may always take one step', () => {
    const unit = makeUnit('a', ['m'], 1)
    advanceUnit(unit, world, noRivers, 1)
    expect(unit.regionId).toBe('m')
    expect(unit.movesLeft).toBe(0)
  })

  it('a partially spent unit waits when it cannot afford the step', () => {
    const unit = makeUnit('a', ['m'], 1)
    advanceUnit(unit, world, noRivers, 2)
    expect(unit.regionId).toBe('a')
    expect(unit.path).toEqual(['m'])
  })

  it('walks multiple cheap steps in one tick and reveals fog immutably', () => {
    const unit = makeUnit('a', ['b', 'c'], 2)
    const next = advanceUnit(unit, world, noRivers, 2)
    expect(unit.regionId).toBe('c')
    expect(next.c.explored).toBe(true)
    expect(world.c.explored).toBe(false) // input untouched
  })
})

describe('revealRadius', () => {
  it('never mutates the input record or its regions', () => {
    const regions = generateWorld(42)
    const capital = Object.values(regions).find((r) => r.isCapital)!
    const before = JSON.stringify(regions)
    const next = revealRadius(regions, capital.id, 3)
    expect(JSON.stringify(regions)).toBe(before)
    expect(next).not.toBe(regions)
    const newly = Object.keys(next).filter((id) => next[id].explored && !regions[id].explored)
    expect(newly.length).toBeGreaterThan(0)
  })

  it('returns the same record when nothing changes', () => {
    const regions = generateWorld(42)
    const capital = Object.values(regions).find((r) => r.isCapital)!
    expect(revealRadius(regions, capital.id, 0)).toBe(regions)
  })
})
