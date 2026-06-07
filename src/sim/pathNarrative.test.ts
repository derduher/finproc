import { describe, it, expect } from 'vitest'
import { buildPathNarrative } from './pathNarrative'
import type { SamplePath } from './montecarlo'

function path(over: Partial<SamplePath>): SamplePath {
  return { balances: [], depleteAge: undefined, cutYears: [], raiseYears: [], ...over }
}

describe('buildPathNarrative', () => {
  it('returns a graceful summary when per-year rates are missing', () => {
    const n = buildPathNarrative({ path: path({ balances: [1, 2, 3] }), currentAge: 60, retireAge: 62 })
    expect(n.points).toEqual([])
    expect(n.summary).toMatch(/not enough detail/i)
  })

  it('leads with depletion when the path runs short', () => {
    const returns = [0.05, -0.3, -0.2, 0.04, 0.05]
    const n = buildPathNarrative({
      path: path({ balances: [100, 70, 40, 0, 0], returns, inflation: returns.map(() => 0.03), depleteAge: 63 }),
      currentAge: 60,
      retireAge: 61,
    })
    expect(n.summary).toMatch(/runs short at age 63/i)
  })

  it('names sequence-of-returns risk when early retirement years are weak', () => {
    // currentAge 60 → year index i covers age 61+i. Ages 62–66 (the first
    // retirement years) are weak; later years are strong.
    const returns = [0.1, -0.06, -0.05, -0.04, -0.05, -0.06, 0.12, 0.13, 0.12, 0.11]
    const n = buildPathNarrative({
      path: path({ balances: returns.map(() => 500_000), returns, inflation: returns.map(() => 0.03) }),
      currentAge: 60,
      retireAge: 62,
    })
    expect(n.summary).toMatch(/first few years/i)
    expect(n.points.some((p) => /retirement year/i.test(p))).toBe(true)
  })

  it('describes a steady path and reports the average return', () => {
    const returns = Array.from({ length: 8 }, () => 0.06)
    const n = buildPathNarrative({
      path: path({ balances: returns.map(() => 500_000), returns, inflation: returns.map(() => 0.03) }),
      currentAge: 60,
      retireAge: 62,
    })
    expect(n.summary).toMatch(/steady/i)
    expect(n.avgReturn).toBeCloseTo(0.06, 5)
    expect(n.summary).toMatch(/6%/)
  })

  it('mentions guardrail spending cuts when present', () => {
    const returns = Array.from({ length: 8 }, () => 0.06)
    const n = buildPathNarrative({
      path: path({ balances: returns.map(() => 500_000), returns, inflation: returns.map(() => 0.03), cutYears: [66, 67] }),
      currentAge: 60,
      retireAge: 62,
    })
    expect(n.points.some((p) => /trimmed in 2 years/i.test(p))).toBe(true)
  })
})
