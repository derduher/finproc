import { describe, it, expect } from 'vitest'
import {
  accountKind,
  applyAccountKind,
  kindSupportsMax,
  annualContribOf,
  withAnnualContrib,
  setContributionFrequency,
  CONTRIBUTION_FREQUENCY_LABELS,
  defaultEmployerMatch,
  withMatchType,
} from './advancedHelpers'
import type { Account } from '../../schema'

const base: Account = {
  id: 'a',
  name: 'Acct',
  type: 'traditional',
  balance: 1000,
  contributionAmount: 500,
  contributionType: 'flat',
  contributionFrequency: 'monthly',
  contributionEndAge: 65,
  withdrawalStartAge: 65,
}

describe('account kind mapping', () => {
  it('derives kind from type + subtype', () => {
    expect(accountKind({ type: 'traditional', accountSubtype: '401k' })).toBe('401k')
    expect(accountKind({ type: 'traditional', accountSubtype: 'ira' })).toBe('tradIra')
    expect(accountKind({ type: 'roth', accountSubtype: 'ira' })).toBe('rothIra')
    expect(accountKind({ type: 'taxable' })).toBe('taxable')
  })

  it('applies a kind back onto an account', () => {
    expect(applyAccountKind(base, 'rothIra')).toMatchObject({ type: 'roth', accountSubtype: 'ira' })
    expect(applyAccountKind(base, 'tradIra')).toMatchObject({ type: 'traditional', accountSubtype: 'ira' })
    const tax = applyAccountKind(base, 'taxable')
    expect(tax).toMatchObject({ type: 'taxable', contributeMax: false })
    expect(tax.accountSubtype).toBeUndefined()
  })

  it('only non-taxable kinds support maxing', () => {
    expect(kindSupportsMax('401k')).toBe(true)
    expect(kindSupportsMax('taxable')).toBe(false)
  })
})

describe('contribution conversion', () => {
  it('annualises a flat monthly contribution', () => {
    expect(annualContribOf({ contributionAmount: 500, contributionType: 'flat', contributionFrequency: 'monthly' })).toBe(6000)
    expect(annualContribOf({ contributionAmount: 100, contributionType: 'flat', contributionFrequency: 'semi-monthly' })).toBe(2400)
  })

  it('round-trips through withAnnualContrib', () => {
    const a = withAnnualContrib(base, 12_000)
    expect(a.contributionType).toBe('flat')
    expect(a.contributionFrequency).toBe('monthly')
    expect(annualContribOf(a)).toBeCloseTo(12_000, 6)
  })
})

describe('contribution frequency selection (#2)', () => {
  it('keeps the per-period amount when frequency changes (so annual scales)', () => {
    // $500/month = $6,000/yr. Switching to weekly keeps $500 per period → $6,500/yr.
    const weekly = setContributionFrequency(base, 'weekly')
    expect(weekly.contributionFrequency).toBe('weekly')
    expect(weekly.contributionAmount).toBe(500)
    expect(annualContribOf(weekly)).toBeCloseTo(500 * 52, 6)
  })

  it('exposes a label for every frequency', () => {
    expect(CONTRIBUTION_FREQUENCY_LABELS.weekly).toBeTruthy()
    expect(CONTRIBUTION_FREQUENCY_LABELS['semi-monthly']).toBeTruthy()
    expect(CONTRIBUTION_FREQUENCY_LABELS.monthly).toBeTruthy()
  })
})

describe('employer match type (#1)', () => {
  it('builds sensible flat and percent defaults', () => {
    expect(defaultEmployerMatch('flat')).toEqual({ type: 'flat', annualAmount: 6000 })
    const pct = defaultEmployerMatch('percent')
    expect(pct.type).toBe('percent')
    if (pct.type === 'percent') {
      expect(pct.matchPercent).toBeGreaterThan(0)
      expect(pct.upToPercent).toBeGreaterThan(0)
    }
  })

  it('toggles an account between match types and off', () => {
    const flat = withMatchType(base, 'flat')
    expect(flat.employerMatch?.type).toBe('flat')
    const pct = withMatchType(flat, 'percent')
    expect(pct.employerMatch?.type).toBe('percent')
    const off = withMatchType(pct, null)
    expect(off.employerMatch).toBeUndefined()
  })
})
