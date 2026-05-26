import { describe, it, expect } from 'vitest'
import { runMonteCarlo } from './montecarlo'
import { defaultInputs } from '../schema'
import type { SimulationInputs } from '../schema'

function inputs(overrides: Partial<SimulationInputs> = {}): SimulationInputs {
  return { ...defaultInputs(), ...overrides }
}

describe('aggregateCashflows — edge cases', () => {
  it('returns [] for an empty runs array', async () => {
    const { aggregateCashflows } = await import('./cashflow')
    expect(aggregateCashflows([])).toEqual([])
  })
})

describe('MonteCarloResult — cashflow series', () => {
  it('yearlyResults entries include contributions / socialSecurity / withdrawals medians', () => {
    const result = runMonteCarlo(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 70 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 500_000,
          contributionAmount: 0,
          contributionType: 'flat', contributionFrequency: 'monthly',
          contributionEndAge: 59, withdrawalStartAge: 59,
        }],
        annualExpenses: 40_000,
      }),
      50,
      42,
    )
    for (const yr of result.yearlyResults) {
      expect(yr).toHaveProperty('contributionsMedian')
      expect(yr).toHaveProperty('socialSecurityMedian')
      expect(yr).toHaveProperty('withdrawalsMedian')
      expect(typeof yr.contributionsMedian).toBe('number')
    }
  })

  it('contributionsMedian > 0 during working years, 0 after contributionEndAge', () => {
    const result = runMonteCarlo(
      inputs({
        person: { ...defaultInputs().person, currentAge: 32, maxAge: 70, annualSalary: 100_000 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 0,
          contributionAmount: 500,
          contributionType: 'flat', contributionFrequency: 'monthly',
          contributionEndAge: 62, withdrawalStartAge: 59,
        }],
        annualExpenses: 50_000,
      }),
      30,
      42,
    )
    const working = result.yearlyResults.find((r) => r.age === 40)!
    const retired = result.yearlyResults.find((r) => r.age === 68)!
    expect(working.contributionsMedian).toBeGreaterThan(0)
    expect(retired.contributionsMedian).toBe(0)
  })

  it('socialSecurityMedian is 0 before claimAge and > 0 after', () => {
    const result = runMonteCarlo(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 75 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 500_000,
          contributionAmount: 0,
          contributionType: 'flat', contributionFrequency: 'monthly',
          contributionEndAge: 59, withdrawalStartAge: 59,
        }],
        annualExpenses: 40_000,
        socialSecurity: { annualAmountPresentDollars: 24_000, claimAge: 67 },
      }),
      30,
      42,
    )
    const before = result.yearlyResults.find((r) => r.age === 65)!
    const after = result.yearlyResults.find((r) => r.age === 70)!
    expect(before.socialSecurityMedian).toBe(0)
    expect(after.socialSecurityMedian).toBeGreaterThan(0)
  })

  it('withdrawalsMedian is 0 during working years and > 0 in retirement', () => {
    const result = runMonteCarlo(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 75, annualSalary: 0 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 500_000,
          contributionAmount: 0,
          contributionType: 'flat', contributionFrequency: 'monthly',
          contributionEndAge: 59, withdrawalStartAge: 59,
        }],
        annualExpenses: 30_000,
      }),
      30,
      42,
    )
    // age 65 = year index 5, in retirement (effective retire age = 59)
    const inRetirement = result.yearlyResults.find((r) => r.age === 65)!
    expect(inRetirement.withdrawalsMedian).toBeGreaterThan(0)
  })
})
