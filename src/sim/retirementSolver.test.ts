import { describe, it, expect } from 'vitest'
import { findRetirementAgeForSuccess } from './retirementSolver'
import { runMonteCarlo } from './montecarlo'
import { withRetirementAge } from './retirementAge'
import { defaultInputs } from '../schema'
import type { SimulationInputs } from '../schema'

// Deterministic markets (zero variance) → successRate is 0 or 1, giving a clean
// crossover age the solver can pin down exactly.
function scenario(overrides: Partial<SimulationInputs> = {}): SimulationInputs {
  return {
    ...defaultInputs(),
    person: {
      currentAge: 40,
      maxAge: 90,
      retirementAge: 62,
      annualSalary: 80_000,
      salaryGrowthRate: 0.0,
      marginalTaxRate: 0.2,
      ltcgRate: 0.15,
    },
    accounts: [
      {
        id: 't', name: 'Brokerage', type: 'taxable',
        balance: 300_000,
        contributionAmount: 1000,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: 62,
        withdrawalStartAge: 62,
      },
    ],
    annualExpenses: 50_000,
    initialStockGrowthMin: 0.05,
    initialStockGrowthMax: 0.05,
    initialInflationMin: 0.02,
    initialInflationMax: 0.02,
    breakpoints: [],
    ...overrides,
  }
}

const RUN_COUNT = 40

describe('findRetirementAgeForSuccess', () => {
  it('returns the minimum retirement age whose success rate meets the target', () => {
    const inputs = scenario()
    const result = findRetirementAgeForSuccess(inputs, 0.9, { runCount: RUN_COUNT })
    expect(result).toBeDefined()
    const { age, successRate } = result!
    expect(age).toBeGreaterThanOrEqual(inputs.person.currentAge)
    expect(age).toBeLessThanOrEqual(inputs.person.maxAge)
    expect(successRate).toBeGreaterThanOrEqual(0.9)
  })

  it('the returned age is minimal — retiring one year earlier misses the target', () => {
    const inputs = scenario()
    const result = findRetirementAgeForSuccess(inputs, 0.9, { runCount: RUN_COUNT })!
    if (result.age > inputs.person.currentAge) {
      const earlier = runMonteCarlo(
        withRetirementAge(inputs, result.age - 1),
        RUN_COUNT,
        inputs.seed,
      )
      expect(earlier.successRate).toBeLessThan(0.9)
    }
  })

  it('returns undefined when even retiring at maxAge cannot reach the target', () => {
    // Expenses dwarf the portfolio — no retirement age succeeds.
    const inputs = scenario({ annualExpenses: 500_000, accounts: [
      {
        id: 't', name: 'Brokerage', type: 'taxable',
        balance: 100_000,
        contributionAmount: 0,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: 62,
        withdrawalStartAge: 62,
      },
    ] })
    const result = findRetirementAgeForSuccess(inputs, 0.9, { runCount: RUN_COUNT })
    expect(result).toBeUndefined()
  })

  it('returns currentAge when the plan already succeeds by retiring immediately', () => {
    const inputs = scenario({
      annualExpenses: 1_000,
      accounts: [
        {
          id: 't', name: 'Brokerage', type: 'taxable',
          balance: 5_000_000,
          contributionAmount: 0,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 62,
          withdrawalStartAge: 62,
        },
      ],
    })
    const result = findRetirementAgeForSuccess(inputs, 0.9, { runCount: RUN_COUNT })
    expect(result).toBeDefined()
    expect(result!.age).toBe(inputs.person.currentAge)
  })
})
