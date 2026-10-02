import { describe, expect, it } from 'vitest'
import { generateWorld, isClaimable, findPath } from './world'
import { isLand } from '../../data/terrain'

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
