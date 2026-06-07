import { describe, it, expect } from 'vitest'
import { deriveOutcomeReads } from './outcome'
import type { MonteCarloResult } from './montecarlo'

function makeResult(overrides: Partial<MonteCarloResult> = {}): MonteCarloResult {
  return {
    yearlyResults: [],
    successRate: 0.99,
    p50EndBalance: 5_000_000,
    p10EndBalance: 1_300_000,
    p90EndBalance: 13_300_000,
    medianDepleteAge: undefined,
    samplePaths: [],
    shortfallByPercentile: [
      { fraction: 0.01, age: 79 },
      { fraction: 0.05, age: undefined },
      { fraction: 0.1, age: undefined },
      { fraction: 0.25, age: undefined },
      { fraction: 0.5, age: undefined },
    ],
    ...overrides,
  }
}

describe('deriveOutcomeReads', () => {
  it('flags an over-saver: sustainable above target → under-spending', () => {
    const o = deriveOutcomeReads({ result: makeResult(), sustainable: 103_000, target: 80_000, maxAge: 95, retireAge: 65 })
    expect(o.isOverSaver).toBe(true)
    expect(o.underspendBy).toBe(23_000)
    expect(o.overspendBy).toBe(0)
  })

  it('flags an under-funded plan: target above sustainable → over-spending', () => {
    const o = deriveOutcomeReads({ result: makeResult(), sustainable: 60_000, target: 80_000, maxAge: 95, retireAge: 65 })
    expect(o.isOverSaver).toBe(false)
    expect(o.overspendBy).toBe(20_000)
    expect(o.underspendBy).toBe(0)
  })

  it('surfaces the worst-case shortfall ages from shortfallByPercentile', () => {
    const o = deriveOutcomeReads({ result: makeResult(), sustainable: 103_000, target: 80_000, maxAge: 95, retireAge: 65 })
    // worst 1-in-10 stays funded here (undefined), worst 1-in-100 runs short at 79
    expect(o.worstShortfallAge).toBeUndefined()
    expect(o.rareShortfallAge).toBe(79)
  })

  it('carries the surplus/legacy distribution and hold rate', () => {
    const o = deriveOutcomeReads({ result: makeResult({ successRate: 0.97 }), sustainable: 103_000, target: 80_000, maxAge: 95, retireAge: 65 })
    expect(o.legacyP50).toBe(5_000_000)
    expect(o.legacyP10).toBe(1_300_000)
    expect(o.legacyP90).toBe(13_300_000)
    expect(o.holdRate).toBe(0.97)
  })

  it('carries the retirement age so the read can be time-scoped', () => {
    const o = deriveOutcomeReads({ result: makeResult(), sustainable: 103_000, target: 80_000, maxAge: 95, retireAge: 67 })
    expect(o.retireAge).toBe(67)
  })
})
