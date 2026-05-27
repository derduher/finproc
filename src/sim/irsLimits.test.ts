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
})
