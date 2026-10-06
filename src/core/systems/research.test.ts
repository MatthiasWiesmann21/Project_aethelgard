import { describe, expect, it } from 'vitest'
import {
  advanceEra,
  baseModifiers,
  computeModifiers,
  computeResearchTick,
  pruneQueue,
  researchBlockReason,
} from './research'
import { TECHS } from '../../data/techs'

describe('computeModifiers', () => {
  it('returns base modifiers with no techs', () => {
    expect(computeModifiers([])).toEqual(baseModifiers())
  })

  it('folds tech effects', () => {
    const mods = computeModifiers(['writing', 'currency', 'roads'])
    expect(mods.scienceMultiplier).toBeCloseTo(1.15)
    expect(mods.unlockedBuildings).toContain('market')
    expect(mods.claimCostMultiplier).toBeCloseTo(0.85)
  })
})

describe('computeResearchTick', () => {
  it('accumulates progress toward the active tech', () => {
    const res = computeResearchTick('writing', 10, ['oral_tradition'], 5)
    expect(res.progress).toBe(15)
    expect(res.justCompleted).toEqual([])
  })

  it('completes a tech when progress reaches cost', () => {
    const cost = TECHS.writing.cost
    const res = computeResearchTick('writing', cost - 1, ['oral_tradition'], 5)
    expect(res.justCompleted.map((t) => t.id)).toContain('writing')
    expect(res.completed).toContain('writing')
    expect(res.activeId).toBeNull()
    expect(res.progress).toBe(0)
  })

  it('auto-advances to the queued tech and carries leftover science', () => {
    const cost = TECHS.oral_tradition.cost
    const res = computeResearchTick(
      'oral_tradition',
      cost - 1,
      [],
      6,
      ['barter'],
    )
    expect(res.completed).toContain('oral_tradition')
    expect(res.activeId).toBe('barter')
    expect(res.queue).toEqual([])
    expect(res.progress).toBe(5) // 6 − 1 remaining
  })

  it('can chain through multiple queued techs', () => {
    const res = computeResearchTick(
      'oral_tradition',
      0,
      [],
      40, // oral_tradition 12 + barter 12 → both done, 16 into scouting
      ['barter', 'scouting'],
    )
    expect(res.completed).toEqual(['oral_tradition', 'barter'])
    expect(res.activeId).toBe('scouting')
    expect(res.justCompleted).toHaveLength(2)
  })

  it('does nothing without an active tech', () => {
    const res = computeResearchTick(null, 0, [], 5)
    expect(res.progress).toBe(0)
  })
})

describe('researchBlockReason', () => {
  it('blocks on missing prerequisites', () => {
    expect(researchBlockReason(TECHS.writing, [], 'ancient')).toMatch(
      /Oral Tradition/,
    )
  })

  it('blocks future eras', () => {
    expect(
      researchBlockReason(TECHS.universities, ['code_of_laws'], 'medieval'),
    ).toMatch(/renaissance/i)
  })

  it('allows when requirements are met', () => {
    expect(
      researchBlockReason(TECHS.writing, ['oral_tradition'], 'ancient'),
    ).toBeNull()
  })

  it('counts active/queued techs as planned prerequisites', () => {
    expect(
      researchBlockReason(TECHS.craftsmanship, [], 'ancient', [
        'oral_tradition',
        'writing',
      ]),
    ).toBeNull()
  })
})

describe('pruneQueue', () => {
  it('drops queued techs whose prerequisite left the plan', () => {
    // writing needs oral_tradition, craftsmanship needs writing
    expect(pruneQueue(['writing', 'craftsmanship', 'barter'], [], null)).toEqual([
      'barter',
    ])
  })

  it('keeps chains rooted in the active tech', () => {
    expect(
      pruneQueue(['writing', 'craftsmanship'], [], 'oral_tradition'),
    ).toEqual(['writing', 'craftsmanship'])
  })
})

describe('advanceEra', () => {
  it('advances after enough current-era techs', () => {
    const fourAncient = ['oral_tradition', 'writing', 'barter', 'masonry']
    expect(advanceEra('ancient', fourAncient)).toBe('medieval')
  })

  it('stays when below threshold', () => {
    expect(advanceEra('ancient', ['oral_tradition', 'writing'])).toBe('ancient')
  })

  it('stays at the last era', () => {
    const techs = Object.values(TECHS)
      .filter((t) => t.era === 'industrial')
      .map((t) => t.id)
    expect(advanceEra('industrial', techs)).toBe('industrial')
  })
})
