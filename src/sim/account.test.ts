import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { SimAccount } from './account'
import { annualToMonthlyRate } from '../math'
import type { Account } from '../schema'

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Test',
    type: 'traditional',
    balance: 0,
    contributionAmount: 0,
    contributionType: 'flat',
    contributionFrequency: 'monthly',
    contributionEndAge: 62,
    withdrawalStartAge: 59,
    ...overrides,
  }
}

describe('SimAccount — monthly growth', () => {
  it('zero growth, N months, no contributions → balance unchanged', () => {
    const acc = new SimAccount(makeAccount({ balance: 10000 }), 0)
    for (let i = 0; i < 12; i++) acc.applyMonthlyGrowth(0)
    expect(acc.getBalance()).toBeCloseTo(10000, 5)
  })

  it('7% annual → FV matches formula after 12 months', () => {
    const annual = 0.07
    const monthly = annualToMonthlyRate(annual)
    const initial = 100000
    const acc = new SimAccount(makeAccount({ balance: initial }), 0)
    for (let i = 0; i < 12; i++) acc.applyMonthlyGrowth(monthly)
    const expected = initial * Math.pow(1 + monthly, 12)
    expect(acc.getBalance()).toBeCloseTo(expected, 2)
  })

  it('property: balance monotonically increases with positive growth and no withdrawals', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1000, max: 1e6, noNaN: true }),
        fc.double({ min: 0.001, max: 0.02, noNaN: true }),
        (initial, monthlyRate) => {
          const acc = new SimAccount(makeAccount({ balance: initial }), 0)
          let prev = acc.getBalance()
          for (let i = 0; i < 12; i++) {
            acc.applyMonthlyGrowth(monthlyRate)
            const cur = acc.getBalance()
            if (cur < prev) return false
            prev = cur
          }
          return true
        },
      ),
    )
  })
})

describe('SimAccount — contribute max (IRS limit)', () => {
  it('with contributeMax=true and accountSubtype="401k", monthly contribution is 401k limit / 12', () => {
    const acc = new SimAccount(
      makeAccount({
        type: 'traditional',
        accountSubtype: '401k',
        contributeMax: true,
        contributionAmount: 50, // should be ignored
        contributionType: 'flat',
        contributionFrequency: 'monthly',
      }),
      0,
    )
    acc.contribute(40, 100000)
    // 2026 401k limit = $24,500 → $2041.67/mo
    expect(acc.getBalance()).toBeCloseTo(24500 / 12, 2)
  })

  it('with contributeMax=true and accountSubtype="ira", monthly contribution is IRA limit / 12', () => {
    const acc = new SimAccount(
      makeAccount({
        type: 'traditional',
        accountSubtype: 'ira',
        contributeMax: true,
        contributionAmount: 50,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
      }),
      0,
    )
    acc.contribute(40, 100000)
    // 2026 IRA limit = $7,500 → $625/mo
    expect(acc.getBalance()).toBeCloseTo(7500 / 12, 2)
  })

  it('with contributeMax=true but subtype undefined → falls back to flat contribution', () => {
    const acc = new SimAccount(
      makeAccount({
        type: 'traditional',
        contributeMax: true,
        // no accountSubtype
        contributionAmount: 250,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
      }),
      0,
    )
    acc.contribute(40, 100000)
    expect(acc.getBalance()).toBeCloseTo(250, 2)
  })

  it('contributeMax respects contributionEndAge', () => {
    const acc = new SimAccount(
      makeAccount({
        type: 'traditional',
        accountSubtype: '401k',
        contributeMax: true,
        contributionAmount: 0,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: 62,
      }),
      0,
    )
    acc.contribute(65, 100000) // past contributionEndAge
    expect(acc.getBalance()).toBe(0)
  })
})

describe('SimAccount — contributions', () => {
  it('flat monthly contribution: balance = initial + contrib × months (no growth)', () => {
    const acc = new SimAccount(
      makeAccount({ balance: 0, contributionAmount: 500, contributionType: 'flat', contributionFrequency: 'monthly' }),
      0,
    )
    for (let m = 0; m < 24; m++) {
      acc.applyMonthlyGrowth(0)
      acc.contribute(0, 50000) // salary doesn't matter for flat
    }
    // Each contribution gets half-month of 0% growth = exactly 500
    expect(acc.getBalance()).toBeCloseTo(24 * 500, 2)
  })

  it('percent-of-salary contribution: monthly amount = (pct × salary) / 12', () => {
    const acc = new SimAccount(
      makeAccount({ balance: 0, contributionAmount: 0.15, contributionType: 'percent', contributionFrequency: 'monthly' }),
      0,
    )
    const salary = 95000
    for (let m = 0; m < 12; m++) {
      acc.applyMonthlyGrowth(0)
      acc.contribute(0, salary)
    }
    expect(acc.getBalance()).toBeCloseTo(salary * 0.15, 1)
  })

  it('weekly frequency aggregates as ~4.33 per month', () => {
    const weeklyAmount = 200
    const acc = new SimAccount(
      makeAccount({ balance: 0, contributionAmount: weeklyAmount, contributionType: 'flat', contributionFrequency: 'weekly' }),
      0,
    )
    acc.applyMonthlyGrowth(0)
    acc.contribute(0, 0)
    // 52/12 weeks per month × 200 = ~866.67
    expect(acc.getBalance()).toBeCloseTo((52 / 12) * weeklyAmount, 0)
  })

  it('semi-monthly frequency aggregates as 2 per month', () => {
    const semiAmount = 750
    const acc = new SimAccount(
      makeAccount({ balance: 0, contributionAmount: semiAmount, contributionType: 'flat', contributionFrequency: 'semi-monthly' }),
      0,
    )
    acc.applyMonthlyGrowth(0)
    acc.contribute(0, 0)
    expect(acc.getBalance()).toBeCloseTo(2 * semiAmount, 2)
  })

  it('contributions stop after contributionEndAge', () => {
    const acc = new SimAccount(
      makeAccount({ balance: 0, contributionAmount: 1000, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 62 }),
      0,
    )
    acc.applyMonthlyGrowth(0)
    acc.contribute(63, 0) // past end age — no contribution
    expect(acc.getBalance()).toBeCloseTo(0, 5)
  })

  it('contributions apply in years before contributionEndAge', () => {
    const acc = new SimAccount(
      makeAccount({ balance: 0, contributionAmount: 1000, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 62 }),
      0,
    )
    acc.applyMonthlyGrowth(0)
    acc.contribute(61, 0)
    expect(acc.getBalance()).toBeCloseTo(1000, 5)
  })

  it('contributions stop AT contributionEndAge (retirement year is not a contributing year)', () => {
    // contributionEndAge is the age at which contributions stop, so the year the
    // person turns that age earns no contribution. This keeps cashflow contributions
    // ending exactly at the retire marker rather than one year past it.
    const acc = new SimAccount(
      makeAccount({ balance: 0, contributionAmount: 1000, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 62 }),
      0,
    )
    acc.applyMonthlyGrowth(0)
    acc.contribute(62, 0)
    expect(acc.getBalance()).toBeCloseTo(0, 5)
  })

  it('employer match percent-of-salary: 100% up to 6% on $100K = $6K/yr', () => {
    const acc = new SimAccount(
      makeAccount({
        balance: 0,
        type: 'traditional',
        contributionAmount: 0.15,
        contributionType: 'percent',
        contributionFrequency: 'monthly',
        contributionEndAge: 62,
        employerMatch: { type: 'percent', matchPercent: 100, upToPercent: 6 },
      }),
      0,
    )
    const salary = 100000
    for (let m = 0; m < 12; m++) {
      acc.applyMonthlyGrowth(0)
      acc.contribute(30, salary)
    }
    // Employee: 15% × $100K = $15K, Match: 6% × $100K = $6K
    // Total = $21K
    expect(acc.getBalance()).toBeCloseTo(21000, 0)
  })

  it('employer flat match: adds annual flat amount monthly', () => {
    const acc = new SimAccount(
      makeAccount({
        balance: 0,
        type: 'traditional',
        contributionAmount: 1000,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: 62,
        employerMatch: { type: 'flat', annualAmount: 3000 },
      }),
      0,
    )
    for (let m = 0; m < 12; m++) {
      acc.applyMonthlyGrowth(0)
      acc.contribute(30, 0)
    }
    // Employee: $12K, Employer: $3K = $15K total
    expect(acc.getBalance()).toBeCloseTo(15000, 1)
  })
})

describe('SimAccount — cost basis (taxable accounts)', () => {
  it('initial costBasis equals initial balance if not specified', () => {
    const acc = new SimAccount(makeAccount({ type: 'taxable', balance: 50000 }), 0)
    expect(acc.getCostBasis()).toBeCloseTo(50000, 5)
  })

  it('contributions increase cost basis 1:1', () => {
    const acc = new SimAccount(
      makeAccount({ type: 'taxable', balance: 0, contributionAmount: 1000, contributionType: 'flat', contributionFrequency: 'monthly' }),
      0,
    )
    acc.applyMonthlyGrowth(0)
    acc.contribute(30, 0)
    expect(acc.getCostBasis()).toBeCloseTo(1000, 2)
  })

  it('growth does not increase cost basis', () => {
    const acc = new SimAccount(makeAccount({ type: 'taxable', balance: 10000, costBasis: 10000 }), 0)
    acc.applyMonthlyGrowth(annualToMonthlyRate(0.07))
    // growth happened, balance grew, but basis unchanged
    expect(acc.getCostBasis()).toBeCloseTo(10000, 5)
    expect(acc.getBalance()).toBeGreaterThan(10000)
  })

  it('proportional withdrawal reduces basis correctly', () => {
    // balance=100K, basis=60K → gain fraction=40%
    const acc = new SimAccount(
      makeAccount({ type: 'taxable', balance: 100000, costBasis: 60000 }),
      0,
    )
    acc.withdraw(10000) // withdraw 10% of balance
    // After withdrawal: basis reduces proportionally
    const expectedBasis = 60000 * (1 - 10000 / 100000)
    expect(acc.getCostBasis()).toBeCloseTo(expectedBasis, 1)
  })
})

describe('SimAccount — withdrawal', () => {
  it('balance floors at 0; returns actual withdrawn', () => {
    const acc = new SimAccount(makeAccount({ balance: 5000 }), 0)
    const withdrawn = acc.withdraw(10000)
    expect(withdrawn).toBeCloseTo(5000, 5)
    expect(acc.getBalance()).toBe(0)
  })

  it('withdrawal locked before withdrawalStartAge', () => {
    const acc = new SimAccount(makeAccount({ balance: 10000, withdrawalStartAge: 59 }), 0)
    const withdrawn = acc.withdraw(5000, 50) // age 50, below start
    expect(withdrawn).toBe(0)
    expect(acc.getBalance()).toBeCloseTo(10000, 5)
  })

  it('withdrawal allowed at or after withdrawalStartAge', () => {
    const acc = new SimAccount(makeAccount({ balance: 10000, withdrawalStartAge: 59 }), 0)
    const withdrawn = acc.withdraw(5000, 60)
    expect(withdrawn).toBeCloseTo(5000, 5)
  })
})
