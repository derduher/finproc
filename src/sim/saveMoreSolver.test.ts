import { describe, it, expect } from 'vitest'
import { findRequiredExtraSavings, withExtraMonthlyContribution } from './saveMoreSolver'
import { runMonteCarlo } from './montecarlo'
import { defaultInputs } from '../schema'
import type { SimulationInputs } from '../schema'

// Deterministic markets (zero variance) → success rate is 0 or 1, giving a clean
// threshold the bisection can pin down.
function scenario(overrides: Partial<SimulationInputs> = {}): SimulationInputs {
  return {
    ...defaultInputs(),
    person: {
      currentAge: 40,
      maxAge: 90,
      retirementAge: 62,
      annualSalary: 120_000,
      salaryGrowthRate: 0.0,
      marginalTaxRate: 0.2,
      ltcgRate: 0.15,
    },
    accounts: [
      {
        id: 't', name: 'Brokerage', type: 'taxable',
        balance: 150_000,
        contributionAmount: 500,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: 62,
        withdrawalStartAge: 62,
      },
    ],
    annualExpenses: 60_000,
    initialStockGrowthMin: 0.05,
    initialStockGrowthMax: 0.05,
    initialInflationMin: 0.02,
    initialInflationMax: 0.02,
    breakpoints: [],
    ...overrides,
  }
}

const RUN_COUNT = 40

describe('withExtraMonthlyContribution', () => {
  it('adds the extra to the primary still-contributing account as flat monthly', () => {
    const inputs = scenario()
    const out = withExtraMonthlyContribution(inputs, 500)
    expect(out.accounts[0].contributionType).toBe('flat')
    expect(out.accounts[0].contributionFrequency).toBe('monthly')
    expect(out.accounts[0].contributionAmount).toBeCloseTo(1000, 6) // 500 + 500
  })

  it('preserves the existing monthly dollar amount when converting a percent account', () => {
    const inputs = scenario({
      accounts: [
        {
          id: 'p', name: '401k', type: 'traditional', accountSubtype: '401k',
          balance: 150_000,
          contributionAmount: 0.1, // 10% of 120k salary = $1,000/mo
          contributionType: 'percent',
          contributionFrequency: 'monthly',
          contributionEndAge: 62,
          withdrawalStartAge: 62,
        },
      ],
    })
    const out = withExtraMonthlyContribution(inputs, 250)
    expect(out.accounts[0].contributionType).toBe('flat')
    expect(out.accounts[0].contributionAmount).toBeCloseTo(1250, 6) // 1000 + 250
  })
})

describe('findRequiredExtraSavings', () => {
  it('returns 0 when the plan already meets the target', () => {
    const funded = scenario({ annualExpenses: 1_000, accounts: [
      { id: 't', name: 'Brokerage', type: 'taxable', balance: 5_000_000,
        contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 62, withdrawalStartAge: 62 },
    ] })
    const res = findRequiredExtraSavings(funded, 0.9, { runCount: RUN_COUNT })
    expect(res.extraMonthly).toBe(0)
    expect(res.successRate).toBeGreaterThanOrEqual(0.9)
  })

  it('finds an extra monthly amount that lifts an underfunded plan to the target', () => {
    const inputs = scenario()
    // sanity: underfunded as-is
    const base = runMonteCarlo(inputs, RUN_COUNT, inputs.seed).successRate
    expect(base).toBeLessThan(0.9)

    const res = findRequiredExtraSavings(inputs, 0.9, { runCount: RUN_COUNT })
    expect(res.extraMonthly).toBeGreaterThan(0)

    const lifted = runMonteCarlo(
      withExtraMonthlyContribution(inputs, res.extraMonthly),
      RUN_COUNT,
      inputs.seed,
    ).successRate
    expect(lifted).toBeGreaterThanOrEqual(0.9)
  })
})
