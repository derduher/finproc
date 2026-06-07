import { describe, it, expect } from 'vitest'
import { buildVerdict, inflatedSpend } from './verdict'
import type { OutcomeReads } from './outcome'

function reads(over: Partial<OutcomeReads> = {}): OutcomeReads {
  return {
    sustainable: 90_000,
    target: 80_000,
    underspendBy: 10_000,
    overspendBy: 0,
    isOverSaver: true,
    holdRate: 0.95,
    legacyP10: 0,
    legacyP50: 0,
    legacyP90: 0,
    worstShortfallAge: undefined,
    rareShortfallAge: undefined,
    maxAge: 95,
    ...over,
  }
}

describe('buildVerdict', () => {
  it('leads with the retire age and sustainable spend', () => {
    expect(buildVerdict(reads(), 65)).toMatch(/retire at 65/i)
    expect(buildVerdict(reads(), 65)).toMatch(/\$90\.0K/)
  })

  it('frames an over-saver as having room to spare', () => {
    const v = buildVerdict(reads({ isOverSaver: true, sustainable: 90_000, target: 80_000 }), 65)
    expect(v).toMatch(/above your \$80\.0K target/i)
    expect(v).toMatch(/spend more|retire sooner/i)
  })

  it('frames an under-funded plan as needing a trim or more work', () => {
    const v = buildVerdict(reads({ isOverSaver: false, overspendBy: 20_000, sustainable: 60_000, target: 80_000 }), 65)
    expect(v).toMatch(/short of your \$80\.0K target/i)
    expect(v).toMatch(/trimming|working/i)
  })

  it('frames an on-target plan plainly', () => {
    const v = buildVerdict(reads({ isOverSaver: false, overspendBy: 0, sustainable: 80_000, target: 80_000 }), 65)
    expect(v).toMatch(/right at your target/i)
  })
})

describe('inflatedSpend', () => {
  it('compounds today dollars forward at the given rate', () => {
    expect(inflatedSpend(100_000, 0.03, 30)).toBeCloseTo(100_000 * 1.03 ** 30, 4)
  })
  it('is a no-op at zero years', () => {
    expect(inflatedSpend(70_000, 0.03, 0)).toBe(70_000)
  })
  it('clamps negative horizons to zero', () => {
    expect(inflatedSpend(70_000, 0.03, -5)).toBe(70_000)
  })
})
