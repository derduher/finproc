/**
 * Tests for deflateResult — converts a nominal MonteCarloResult to today's-dollar
 * values when displayMode === 'real'. Pass-through when 'nominal'.
 */
import { describe, it, expect } from 'vitest'
import { deflateResult } from './displayMode'
import { defaultInputs } from '../schema'
import type { MonteCarloResult } from './montecarlo'

function makeResult(overrides: Partial<MonteCarloResult> = {}): MonteCarloResult {
  return {
    successRate: 0.84,
    p50EndBalance: 2_400_000,
    p10EndBalance: 310_000,
    medianDepleteAge: undefined,
    yearlyResults: [
      { age: 32, p10: 100, p50: 200, p90: 300, contributionsMedian: 12_000, socialSecurityMedian: 0, withdrawalsMedian: 0 },
      { age: 33, p10: 100, p50: 200, p90: 300, contributionsMedian: 12_000, socialSecurityMedian: 0, withdrawalsMedian: 0 },
      { age: 34, p10: 100, p50: 200, p90: 300, contributionsMedian: 12_000, socialSecurityMedian: 0, withdrawalsMedian: 0 },
    ],
    ...overrides,
  }
}

describe('deflateResult', () => {
  it("returns the same object reference when displayMode is 'nominal'", () => {
    const inputs = defaultInputs()
    const result = makeResult()
    const out = deflateResult(result, 'nominal', inputs)
    expect(out).toBe(result)
  })

  it("returns a deflated copy when displayMode is 'real'", () => {
    const inputs = defaultInputs()
    const result = makeResult()
    const out = deflateResult(result, 'real', inputs)
    expect(out).not.toBe(result)
    // Real-mode endings must be smaller than nominal (positive inflation)
    expect(out.p50EndBalance).toBeLessThan(result.p50EndBalance)
    expect(out.p10EndBalance).toBeLessThan(result.p10EndBalance)
  })

  it('deflates yearlyResults rows by per-age factor', () => {
    const inputs = {
      ...defaultInputs(),
      person: { ...defaultInputs().person, currentAge: 32, maxAge: 34 },
      initialInflationMin: 0.02,
      initialInflationMax: 0.04, // midpoint 3%
      breakpoints: [],
    }
    const result = makeResult()
    const out = deflateResult(result, 'real', inputs)
    // Row at currentAge has factor 1 → unchanged
    expect(out.yearlyResults[0].p50).toBeCloseTo(200, 4)
    // Row 1 year later: factor = 1/1.03
    expect(out.yearlyResults[1].p50).toBeCloseTo(200 / 1.03, 4)
    // Row 2 years later: factor = 1/(1.03^2)
    expect(out.yearlyResults[2].p50).toBeCloseTo(200 / (1.03 * 1.03), 4)
  })

  it('deflates cashflow fields (contributions, ss, withdrawals)', () => {
    const inputs = {
      ...defaultInputs(),
      person: { ...defaultInputs().person, currentAge: 32, maxAge: 34 },
      initialInflationMin: 0.02,
      initialInflationMax: 0.04,
      breakpoints: [],
    }
    const result = makeResult()
    const out = deflateResult(result, 'real', inputs)
    expect(out.yearlyResults[1].contributionsMedian).toBeCloseTo(12_000 / 1.03, 2)
  })
})
