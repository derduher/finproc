import { describe, it, expect } from 'vitest'
import { irsContributionLimit } from './irsLimits'

describe('irsContributionLimit', () => {
  it('returns the 2026 401(k) employee deferral limit', () => {
    const limit = irsContributionLimit('401k')
    // 2026 401(k) employee deferral limit is $24,500
    expect(limit).toBe(24500)
  })

  it('returns the 2026 IRA contribution limit', () => {
    const limit = irsContributionLimit('ira')
    // 2026 IRA contribution limit is $7,500
    expect(limit).toBe(7500)
  })

  it('returns 0 for other / undefined subtype', () => {
    expect(irsContributionLimit('other')).toBe(0)
    expect(irsContributionLimit(undefined)).toBe(0)
  })

  it('adds the 50+ catch-up at or past the catch-up age (#12)', () => {
    expect(irsContributionLimit('401k', 49)).toBe(24500) // just under
    expect(irsContributionLimit('401k', 50)).toBe(24500 + 8000)
    expect(irsContributionLimit('ira', 60)).toBe(7500 + 1100)
  })

  it('grows the limit by the COLA factor (inflation indexing) (#12)', () => {
    expect(irsContributionLimit('401k', 40, 1.5)).toBeCloseTo(24500 * 1.5, 6)
    // catch-up grows with COLA too
    expect(irsContributionLimit('401k', 55, 2)).toBeCloseTo((24500 + 8000) * 2, 6)
  })

  it('other / undefined stay 0 regardless of age or COLA', () => {
    expect(irsContributionLimit('other', 70, 3)).toBe(0)
    expect(irsContributionLimit(undefined, 70, 3)).toBe(0)
  })
})
