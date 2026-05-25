import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  annualToMonthlyRate,
  inflate,
  mulberry32,
  boxMullerNormal,
  percentile,
  rmdDivisor,
  taxableWithdrawalGrossUp,
  traditionalWithdrawalGrossUp,
  formatMoneyAbbreviated,
  p10p90ToSigma,
} from './index'

describe('annualToMonthlyRate', () => {
  it('converts 12% annual to ~0.9489% monthly', () => {
    const monthly = annualToMonthlyRate(0.12)
    expect(monthly).toBeCloseTo(0.009489, 4)
  })

  it('returns 0 for 0% annual', () => {
    expect(annualToMonthlyRate(0)).toBe(0)
  })

  it('handles negative rates', () => {
    const monthly = annualToMonthlyRate(-0.12)
    expect(monthly).toBeLessThan(0)
  })

  it('round-trips: 12 monthly periods compound to annual', () => {
    const annual = 0.07
    const monthly = annualToMonthlyRate(annual)
    const compounded = Math.pow(1 + monthly, 12) - 1
    expect(compounded).toBeCloseTo(annual, 10)
  })
})

describe('inflate', () => {
  it('inflates correctly over 10 years at 3%', () => {
    const result = inflate(1000, 0, 10, 0.03)
    expect(result).toBeCloseTo(1000 * Math.pow(1.03, 10), 2)
  })

  it('no change when fromAge === toAge', () => {
    expect(inflate(5000, 10, 10, 0.03)).toBeCloseTo(5000, 10)
  })

  it('deflates when toAge < fromAge', () => {
    const result = inflate(1000, 10, 5, 0.03)
    expect(result).toBeLessThan(1000)
  })
})

describe('mulberry32', () => {
  it('same seed produces same sequence', () => {
    const rng1 = mulberry32(42)
    const rng2 = mulberry32(42)
    for (let i = 0; i < 20; i++) {
      expect(rng1()).toBe(rng2())
    }
  })

  it('different seeds produce different sequences', () => {
    const rng1 = mulberry32(1)
    const rng2 = mulberry32(2)
    const vals1 = Array.from({ length: 10 }, () => rng1())
    const vals2 = Array.from({ length: 10 }, () => rng2())
    expect(vals1).not.toEqual(vals2)
  })

  it('all values are in [0, 1)', () => {
    const rng = mulberry32(999)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('boxMullerNormal', () => {
  it('10k samples have mean within 2% of input', () => {
    const rng = mulberry32(7)
    const mean = 0.07
    const sigma = 0.03
    const samples = Array.from({ length: 10000 }, () => boxMullerNormal(mean, sigma, rng))
    const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length
    expect(Math.abs(sampleMean - mean)).toBeLessThan(mean * 0.02)
  })

  it('10k samples have stddev within 5% of input', () => {
    const rng = mulberry32(13)
    const mean = 0.07
    const sigma = 0.03
    const samples = Array.from({ length: 10000 }, () => boxMullerNormal(mean, sigma, rng))
    const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length
    const sampleSigma = Math.sqrt(
      samples.reduce((a, b) => a + Math.pow(b - sampleMean, 2), 0) / samples.length,
    )
    expect(Math.abs(sampleSigma - sigma)).toBeLessThan(sigma * 0.05)
  })
})

describe('percentile', () => {
  it('P50 of [1,2,3,4,5] is 3', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBeCloseTo(3, 5)
  })

  it('P0 returns minimum', () => {
    expect(percentile([5, 1, 3, 2, 4], 0)).toBe(1)
  })

  it('P100 returns maximum', () => {
    expect(percentile([5, 1, 3, 2, 4], 100)).toBe(5)
  })

  it('P10 and P90 of normal-ish data bracket the mean', () => {
    const rng = mulberry32(21)
    const samples = Array.from({ length: 1000 }, () => boxMullerNormal(100, 15, rng))
    expect(percentile(samples, 10)).toBeLessThan(100)
    expect(percentile(samples, 90)).toBeGreaterThan(100)
  })
})

describe('rmdDivisor', () => {
  it('returns correct divisor for age 73 (26.5 per 2022 IRS table)', () => {
    expect(rmdDivisor(73)).toBe(26.5)
  })

  it('returns correct divisor for age 80 (20.2)', () => {
    expect(rmdDivisor(80)).toBe(20.2)
  })

  it('returns correct divisor for age 90 (12.2)', () => {
    expect(rmdDivisor(90)).toBe(12.2)
  })

  it('returns 1 for ages beyond table (120+)', () => {
    expect(rmdDivisor(125)).toBe(1.0)
  })

  it('returns undefined for ages below 73', () => {
    expect(rmdDivisor(72)).toBeUndefined()
  })
})

describe('taxableWithdrawalGrossUp', () => {
  it('net delivered matches netNeeded', () => {
    const balance = 100000
    const basis = 60000
    const ltcgRate = 0.15
    const netNeeded = 10000
    const gross = taxableWithdrawalGrossUp(netNeeded, balance, basis, ltcgRate)
    const gainFraction = (balance - basis) / balance
    const tax = gross * gainFraction * ltcgRate
    expect(gross - tax).toBeCloseTo(netNeeded, 2)
  })

  it('no gain fraction means no tax (basis === balance)', () => {
    const gross = taxableWithdrawalGrossUp(5000, 50000, 50000, 0.15)
    expect(gross).toBeCloseTo(5000, 5)
  })

  it('property: gross - tax ≈ net for any valid inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1000, max: 1e6, noNaN: true }),
        fc.double({ min: 0.1, max: 0.9, noNaN: true }),
        fc.double({ min: 0, max: 0.4, noNaN: true }),
        (balance, basisFraction, ltcg) => {
          const basis = balance * basisFraction
          const net = balance * 0.1
          const gross = taxableWithdrawalGrossUp(net, balance, basis, ltcg)
          const gainFraction = (balance - basis) / balance
          const tax = gross * gainFraction * ltcg
          return Math.abs(gross - tax - net) < 0.01
        },
      ),
    )
  })
})

describe('traditionalWithdrawalGrossUp', () => {
  it('net delivered matches netNeeded', () => {
    const net = 10000
    const marginalRate = 0.24
    const gross = traditionalWithdrawalGrossUp(net, marginalRate)
    const tax = gross * marginalRate
    expect(gross - tax).toBeCloseTo(net, 5)
  })

  it('property: gross * (1 - rate) ≈ net', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 1e6, noNaN: true }),
        fc.double({ min: 0, max: 0.6, noNaN: true }),
        (net, rate) => {
          const gross = traditionalWithdrawalGrossUp(net, rate)
          return Math.abs(gross * (1 - rate) - net) < 0.01
        },
      ),
    )
  })
})

describe('formatMoneyAbbreviated', () => {
  it('< $1,000 → no suffix', () => {
    expect(formatMoneyAbbreviated(0)).toBe('$0')
    expect(formatMoneyAbbreviated(999)).toBe('$999')
  })

  it('< $1M → K suffix with one decimal', () => {
    expect(formatMoneyAbbreviated(1500)).toBe('$1.5K')
    expect(formatMoneyAbbreviated(310000)).toBe('$310.0K')
  })

  it('< $1B → M suffix with one decimal', () => {
    expect(formatMoneyAbbreviated(1234567)).toBe('$1.2M')
    expect(formatMoneyAbbreviated(2400000)).toBe('$2.4M')
  })

  it('>= $1B → B suffix with one decimal', () => {
    expect(formatMoneyAbbreviated(1500000000)).toBe('$1.5B')
  })
})

describe('p10p90ToSigma', () => {
  it('derives sigma such that P10/P90 match inputs', () => {
    const sigma = p10p90ToSigma(0.04, 0.10)
    // P10 ≈ mean - 1.28σ, P90 ≈ mean + 1.28σ for normal distribution
    expect(sigma).toBeCloseTo((0.10 - 0.04) / (2 * 1.2816), 3)
  })
})
