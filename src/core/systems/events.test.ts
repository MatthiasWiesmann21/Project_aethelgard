import { describe, expect, it } from 'vitest'
import { EVENT_INTERVAL, rollEvent } from './events'

describe('rollEvent', () => {
  it('is deterministic for the same seed and tick', () => {
    expect(rollEvent(42, EVENT_INTERVAL)).toEqual(rollEvent(42, EVENT_INTERVAL))
  })

  it('never fires off the interval', () => {
    for (const tick of [1, 7, EVENT_INTERVAL - 1, EVENT_INTERVAL + 1, 0]) {
      expect(rollEvent(42, tick)).toBeNull()
    }
  })

  it('fires at least once across many interval ticks', () => {
    let fired = 0
    for (let t = EVENT_INTERVAL; t <= EVENT_INTERVAL * 40; t += EVENT_INTERVAL) {
      if (rollEvent(7, t)) fired++
    }
    expect(fired).toBeGreaterThan(0)
  })
})
