import { describe, it, expect } from 'vitest'
import {
  ordinaryTax,
  taxableSocialSecurity,
  ltcgTaxOnGain,
  grossUpOrdinary,
  grossUpTaxableGain,
  STANDARD_DEDUCTION,
} from './tax'

describe('ordinaryTax — progressive brackets + standard deduction', () => {
  it('income at or below the standard deduction is untaxed', () => {
    expect(ordinaryTax(0, 'single')).toBe(0)
    expect(ordinaryTax(STANDARD_DEDUCTION.single, 'single')).toBe(0)
    expect(ordinaryTax(10_000, 'single')).toBe(0)
  })

  it('fills the 10% bracket first (single)', () => {
    // $15,000 std deduction + $11,925 of 10% bracket = $26,925 gross → all taxed at 10%.
    expect(ordinaryTax(26_925, 'single')).toBeCloseTo(1192.5, 2)
  })

  it('spans into the 12% bracket (single)', () => {
    // gross $40,000 → taxable $25,000. 10% on first 11,925 = 1192.5;
    // 12% on (25,000 - 11,925) = 13,075 → 1569 → total 2761.5
    expect(ordinaryTax(40_000, 'single')).toBeCloseTo(2761.5, 2)
  })

  it('married brackets are wider than single', () => {
    expect(ordinaryTax(80_000, 'married')).toBeLessThan(ordinaryTax(80_000, 'single'))
  })

  it('effective rate on a typical $70k retiree draw is far below the 22% marginal', () => {
    const eff = ordinaryTax(70_000, 'single') / 70_000
    expect(eff).toBeGreaterThan(0.05)
    expect(eff).toBeLessThan(0.13) // nowhere near a flat 22-24%
  })
})

describe('taxableSocialSecurity — provisional income', () => {
  it('no other income → SS is untaxed', () => {
    expect(taxableSocialSecurity(30_000, 0, 'single')).toBe(0)
  })

  it('a zero benefit is never taxable', () => {
    expect(taxableSocialSecurity(0, 50_000, 'single')).toBe(0)
  })

  it('high other income → up to 85% of the benefit is taxable', () => {
    const taxable = taxableSocialSecurity(30_000, 100_000, 'single')
    expect(taxable).toBeCloseTo(0.85 * 30_000, 2)
  })

  it('middle provisional income falls in the 50% tier', () => {
    // single: base1 25k, base2 34k. other=20k, ss=20k → prov = 20k + 10k = 30k (in 25-34k band)
    // taxable = min(0.5*ss, 0.5*(prov-base1)) = min(10000, 0.5*5000=2500) = 2500
    expect(taxableSocialSecurity(20_000, 20_000, 'single')).toBeCloseTo(2500, 2)
  })

  it('married thresholds are higher than single', () => {
    expect(taxableSocialSecurity(30_000, 30_000, 'married')).toBeLessThan(
      taxableSocialSecurity(30_000, 30_000, 'single'),
    )
  })
})

describe('ltcgTaxOnGain — 0/15/20 stacked on ordinary income', () => {
  it('gain that fits under the 0% ceiling is untaxed', () => {
    // single 0% ceiling $48,350 of taxable income.
    expect(ltcgTaxOnGain(20_000, 0, 'single')).toBe(0)
  })

  it('a non-positive gain is untaxed', () => {
    expect(ltcgTaxOnGain(0, 100_000, 'single')).toBe(0)
  })

  it('gain stacked above the 0% ceiling is taxed at 15%', () => {
    // ordinary taxable income already at the ceiling → whole gain at 15%.
    expect(ltcgTaxOnGain(10_000, 48_350, 'single')).toBeCloseTo(1500, 2)
  })

  it('a gain straddling the 0% ceiling is split', () => {
    // incomeBelow 40k, gain 20k → 8.35k at 0%, 11.65k at 15% = 1747.5
    expect(ltcgTaxOnGain(20_000, 40_000, 'single')).toBeCloseTo(1747.5, 2)
  })
})

describe('grossUpOrdinary — invert progressive tax to deliver a target net', () => {
  it('zero net needs zero gross', () => {
    expect(grossUpOrdinary(0, 0, 'single')).toBe(0)
  })

  it('round-trips: gross − incremental tax == requested net', () => {
    for (const [net, stacked] of [
      [40_000, 0],
      [20_000, 30_000],
      [80_000, 0],
      [5_000, 200_000],
    ] as const) {
      const gross = grossUpOrdinary(net, stacked, 'single')
      const tax = ordinaryTax(stacked + gross, 'single') - ordinaryTax(stacked, 'single')
      expect(gross - tax).toBeCloseTo(net, 2)
    }
  })

  it('a net fully inside the deduction needs no gross-up', () => {
    expect(grossUpOrdinary(10_000, 0, 'single')).toBeCloseTo(10_000, 2)
  })

  it('round-trips for married filers too', () => {
    const gross = grossUpOrdinary(120_000, 0, 'married')
    const tax = ordinaryTax(gross, 'married')
    expect(gross - tax).toBeCloseTo(120_000, 2)
  })
})

describe('grossUpTaxableGain — invert LTCG tax', () => {
  it('no embedded gain → gross equals net', () => {
    expect(grossUpTaxableGain(30_000, 0, 0, 'single')).toBeCloseTo(30_000, 2)
  })

  it('round-trips with a 50% gain fraction stacked high', () => {
    const net = 30_000
    const gainFrac = 0.5
    const incomeBelow = 60_000
    const gross = grossUpTaxableGain(net, gainFrac, incomeBelow, 'single')
    const tax = ltcgTaxOnGain(gross * gainFrac, incomeBelow, 'single')
    expect(gross - tax).toBeCloseTo(net, 2)
  })
})
