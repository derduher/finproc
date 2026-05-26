/**
 * Tests for cumulativeDeflator — converts nominal dollars at a future age back
 * to "today's dollars" using the per-segment midpoint inflation rate.
 */
import { describe, it, expect } from 'vitest'
import { cumulativeDeflator } from './index'

describe('cumulativeDeflator', () => {
  it('returns 1 at currentAge (no inflation applied yet)', () => {
    const deflators = cumulativeDeflator({
      currentAge: 32,
      maxAge: 95,
      segments: [{ startAge: 32, inflationMin: 0.02, inflationMax: 0.04 }],
    })
    expect(deflators[0]).toBe(1)
  })

  it('length covers every age from currentAge through maxAge inclusive', () => {
    const deflators = cumulativeDeflator({
      currentAge: 32,
      maxAge: 95,
      segments: [{ startAge: 32, inflationMin: 0.02, inflationMax: 0.04 }],
    })
    expect(deflators).toHaveLength(95 - 32 + 1)
  })

  it('uses midpoint inflation (min+max)/2 when single segment', () => {
    // Midpoint = 0.03 → 1 year later, $1 nominal = $1/1.03 today
    const deflators = cumulativeDeflator({
      currentAge: 30,
      maxAge: 32,
      segments: [{ startAge: 30, inflationMin: 0.02, inflationMax: 0.04 }],
    })
    expect(deflators[1]).toBeCloseTo(1 / 1.03, 6)
    expect(deflators[2]).toBeCloseTo(1 / (1.03 * 1.03), 6)
  })

  it('switches to a later segments midpoint at its startAge', () => {
    // Segment A: ages 30–34 @ 2% midpoint; Segment B: ages 35+ @ 4% midpoint
    const deflators = cumulativeDeflator({
      currentAge: 30,
      maxAge: 36,
      segments: [
        { startAge: 30, inflationMin: 0.01, inflationMax: 0.03 }, // mid 2%
        { startAge: 35, inflationMin: 0.03, inflationMax: 0.05 }, // mid 4%
      ],
    })
    // Years 30→34: 4 transitions @ 2%
    // Year 34: 1/(1.02^4)
    expect(deflators[4]).toBeCloseTo(1 / Math.pow(1.02, 4), 6)
    // Year 35: prior * 1/1.04 (the 4% segment applies from age 35)
    expect(deflators[5]).toBeCloseTo(deflators[4] / 1.04, 6)
    // Year 36: prior * 1/1.04
    expect(deflators[6]).toBeCloseTo(deflators[5] / 1.04, 6)
  })

  it('handles single segment with 0% inflation (deflator stays 1)', () => {
    const deflators = cumulativeDeflator({
      currentAge: 30,
      maxAge: 35,
      segments: [{ startAge: 30, inflationMin: 0, inflationMax: 0 }],
    })
    for (const d of deflators) {
      expect(d).toBeCloseTo(1, 6)
    }
  })

  it('handles negative inflation (deflation) by yielding deflators > 1', () => {
    const deflators = cumulativeDeflator({
      currentAge: 30,
      maxAge: 32,
      segments: [{ startAge: 30, inflationMin: -0.02, inflationMax: -0.02 }],
    })
    expect(deflators[1]).toBeGreaterThan(1)
    expect(deflators[2]).toBeGreaterThan(deflators[1])
  })

  it('treats a segment whose startAge is before currentAge as the active segment', () => {
    // If somehow segments start earlier, use them. (Pre-currentAge ages aren't in the output.)
    const deflators = cumulativeDeflator({
      currentAge: 32,
      maxAge: 34,
      segments: [{ startAge: 20, inflationMin: 0.02, inflationMax: 0.04 }],
    })
    expect(deflators[0]).toBe(1)
    expect(deflators[1]).toBeCloseTo(1 / 1.03, 6)
  })
})
