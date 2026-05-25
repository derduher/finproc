import { describe, it, expect } from 'vitest'
import { simulate } from './simulator'
import { defaultInputs, WithdrawalStrategy } from '../schema'

const BASE_INPUTS = {
  ...defaultInputs(),
  person: { ...defaultInputs().person, currentAge: 62, maxAge: 75, marginalTaxRate: 0 },
  accounts: [{
    id: 'a', name: 'Roth', type: 'roth' as const,
    balance: 2_000_000,
    contributionAmount: 0,
    contributionType: 'flat' as const,
    contributionFrequency: 'monthly' as const,
    contributionEndAge: 61,
    withdrawalStartAge: 62,
  }],
  annualExpenses: 60000,
  withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
}

describe('simulate — Comlink wrapper', () => {
  it('returns MonteCarloResult with correct shape', async () => {
    const result = await simulate(BASE_INPUTS, 50)
    expect(result).toHaveProperty('successRate')
    expect(result).toHaveProperty('yearlyResults')
    expect(result).toHaveProperty('p50EndBalance')
    expect(result).toHaveProperty('p10EndBalance')
    expect(result.successRate).toBeGreaterThanOrEqual(0)
    expect(result.successRate).toBeLessThanOrEqual(1)
    expect(result.yearlyResults.length).toBe(75 - 62)
  })

  it('returns same result for same seed (deterministic)', async () => {
    const r1 = await simulate(BASE_INPUTS, 100)
    const r2 = await simulate(BASE_INPUTS, 100)
    expect(r1.successRate).toBe(r2.successRate)
    expect(r1.p50EndBalance).toBe(r2.p50EndBalance)
  })

  it('p10 ≤ p50 ≤ p90 for each year', async () => {
    const result = await simulate(BASE_INPUTS, 100)
    for (const yr of result.yearlyResults) {
      expect(yr.p10).toBeLessThanOrEqual(yr.p50)
      expect(yr.p50).toBeLessThanOrEqual(yr.p90)
    }
  })

  it('uses inputs.seed for reproducibility', async () => {
    const inp1 = { ...BASE_INPUTS, seed: 123 }
    const inp2 = { ...BASE_INPUTS, seed: 456 }
    const r1 = await simulate(inp1, 50)
    const r2 = await simulate(inp2, 50)
    // Different seeds → different p50
    expect(r1.p50EndBalance).not.toBe(r2.p50EndBalance)
  })
})

describe('simulate — error propagation', () => {
  it('throws on invalid run count', async () => {
    await expect(simulate(BASE_INPUTS, 0)).rejects.toThrow()
  })
})
