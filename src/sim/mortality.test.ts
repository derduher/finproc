import { describe, it, expect } from 'vitest'
import { mortalityRate, sampleAgeAtDeath, MORTALITY_MAX_AGE } from './mortality'
import { mulberry32, percentile } from '../math'

describe('mortalityRate (Gompertz qx)', () => {
  it('rises monotonically with age', () => {
    expect(mortalityRate(40)).toBeLessThan(mortalityRate(65))
    expect(mortalityRate(65)).toBeLessThan(mortalityRate(85))
    expect(mortalityRate(85)).toBeLessThan(mortalityRate(100))
  })

  it('is a plausible ~1% per year at 65', () => {
    expect(mortalityRate(65)).toBeGreaterThan(0.005)
    expect(mortalityRate(65)).toBeLessThan(0.02)
  })

  it('forces certain death at and beyond the terminal age', () => {
    expect(mortalityRate(MORTALITY_MAX_AGE)).toBe(1)
    expect(mortalityRate(MORTALITY_MAX_AGE + 10)).toBe(1)
  })
})

describe('sampleAgeAtDeath', () => {
  it('always returns an age strictly after currentAge, capped at the terminal age', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 500; i++) {
      const d = sampleAgeAtDeath(65, rng)
      expect(d).toBeGreaterThan(65)
      expect(d).toBeLessThanOrEqual(MORTALITY_MAX_AGE)
      expect(Number.isInteger(d)).toBe(true)
    }
  })

  it('is deterministic for a given rng sequence', () => {
    const a = Array.from({ length: 20 }, () => 0)
    const b = Array.from({ length: 20 }, () => 0)
    const r1 = mulberry32(7)
    const r2 = mulberry32(7)
    for (let i = 0; i < 20; i++) {
      a[i] = sampleAgeAtDeath(60, r1)
      b[i] = sampleAgeAtDeath(60, r2)
    }
    expect(a).toEqual(b)
  })

  it('a near-zero uniform survives to the terminal age; a near-one dies immediately', () => {
    expect(sampleAgeAtDeath(65, () => 1e-12)).toBe(MORTALITY_MAX_AGE)
    expect(sampleAgeAtDeath(65, () => 0.999999)).toBe(66)
  })

  it('produces a realistic spread with a median age at death near the mid-80s (from 65)', () => {
    const rng = mulberry32(99)
    const draws = Array.from({ length: 20_000 }, () => sampleAgeAtDeath(65, rng))
    const median = percentile(draws, 50)
    expect(median).toBeGreaterThanOrEqual(82)
    expect(median).toBeLessThanOrEqual(90)
    // Real dispersion — not a point mass.
    expect(percentile(draws, 10)).toBeLessThan(percentile(draws, 90) - 10)
  })
})
