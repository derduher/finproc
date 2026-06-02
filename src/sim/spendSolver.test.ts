import { describe, it, expect } from 'vitest'
import { findSustainableSpend } from './spendSolver'
import { runMonteCarlo } from './montecarlo'
import { defaultInputs, WithdrawalStrategy } from '../schema'
import type { SimulationInputs } from '../schema'

function inputs(overrides: Partial<SimulationInputs> = {}): SimulationInputs {
  return { ...defaultInputs(), ...overrides }
}

const plan = (balance: number): SimulationInputs =>
  inputs({
    person: { ...defaultInputs().person, currentAge: 65, maxAge: 90, annualSalary: 0, marginalTaxRate: 0 },
    accounts: [{
      id: 'a', name: 'Roth', type: 'roth', balance,
      contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
      contributionEndAge: 60, withdrawalStartAge: 60,
    }],
    annualExpenses: 60_000,
    withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
  })

describe('findSustainableSpend', () => {
  it('finds a spend whose success meets the target, while spending much more misses it', () => {
    const inp = plan(1_500_000)
    const target = 0.9
    const res = findSustainableSpend(inp, target, { runCount: 300 })

    // The recommended spend holds the target (allow a little MC noise).
    expect(res.successRate).toBeGreaterThanOrEqual(target - 0.05)
    expect(res.spend).toBeGreaterThan(0)

    // Spending 50% more than sustainable should clearly miss the target.
    const overspent = runMonteCarlo(
      { ...inp, annualExpenses: res.spend * 1.5 },
      300,
      inp.seed,
    )
    expect(overspent.successRate).toBeLessThan(target)
  })

  it('a target of 0 returns a large ceiling spend without looping forever', () => {
    const res = findSustainableSpend(plan(1_000_000), 0, { runCount: 50 })
    expect(res.spend).toBeGreaterThan(plan(1_000_000).annualExpenses)
    expect(res.successRate).toBeGreaterThanOrEqual(0)
  })

  it('a richer portfolio sustains a higher spend', () => {
    const poor = findSustainableSpend(plan(800_000), 0.9, { runCount: 250 })
    const rich = findSustainableSpend(plan(2_000_000), 0.9, { runCount: 250 })
    expect(rich.spend).toBeGreaterThan(poor.spend)
  })
})
