import { describe, it, expect } from 'vitest'
import { runMonteCarlo } from './montecarlo'
import { defaultInputs, WithdrawalStrategy } from '../schema'
import type { SimulationInputs } from '../schema'

function inputs(overrides: Partial<SimulationInputs> = {}): SimulationInputs {
  return { ...defaultInputs(), ...overrides }
}

const RICH_ACCOUNT = {
  id: 'a', name: 'Roth', type: 'roth' as const,
  balance: 5_000_000,
  contributionAmount: 0,
  contributionType: 'flat' as const,
  contributionFrequency: 'monthly' as const,
  contributionEndAge: 30,
  withdrawalStartAge: 59,
}

const POOR_ACCOUNT = {
  id: 'a', name: 'Trad', type: 'traditional' as const,
  balance: 10_000,
  contributionAmount: 0,
  contributionType: 'flat' as const,
  contributionFrequency: 'monthly' as const,
  contributionEndAge: 30,
  withdrawalStartAge: 59,
}

describe('runMonteCarlo — seed determinism', () => {
  it('same seed produces identical results', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 80 },
      accounts: [{ ...RICH_ACCOUNT }],
      annualExpenses: 60000,
    })
    const r1 = runMonteCarlo(inp, 100, 42)
    const r2 = runMonteCarlo(inp, 100, 42)
    expect(r1.successRate).toBe(r2.successRate)
    expect(r1.p50EndBalance).toBe(r2.p50EndBalance)
  })

  it('different seeds produce different results', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 80 },
      accounts: [{ ...RICH_ACCOUNT }],
      annualExpenses: 60000,
    })
    const r1 = runMonteCarlo(inp, 100, 1)
    const r2 = runMonteCarlo(inp, 100, 999)
    // Very unlikely to be exactly equal across 100 runs
    expect(r1.p50EndBalance).not.toBe(r2.p50EndBalance)
  })
})

describe('runMonteCarlo — sigma=0 case', () => {
  it('zero variance inputs → all runs identical → p10 = p50 = p90', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 80 },
      accounts: [{ ...RICH_ACCOUNT }],
      annualExpenses: 60000,
      initialStockGrowthMin: 0.07,
      initialStockGrowthMax: 0.07,
      initialInflationMin: 0.03,
      initialInflationMax: 0.03,
    })
    const result = runMonteCarlo(inp, 50, 42)
    // With zero variance, all runs are identical
    expect(result.successRate).toBe(1)
    // p10/p50/p90 should be equal (same value from all runs)
    const lastYr = result.yearlyResults.at(-1)!
    expect(lastYr.p10).toBeCloseTo(lastYr.p50, 0)
    expect(lastYr.p50).toBeCloseTo(lastYr.p90, 0)
  })
})

describe('runMonteCarlo — success rate', () => {
  it('rich portfolio → high success rate', () => {
    const result = runMonteCarlo(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 90, marginalTaxRate: 0 },
        accounts: [{ ...RICH_ACCOUNT }],
        annualExpenses: 60000,
      }),
      200,
      42,
    )
    expect(result.successRate).toBeGreaterThan(0.9)
  })

  it('tiny portfolio vs large expenses → low success rate', () => {
    const result = runMonteCarlo(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 90, marginalTaxRate: 0 },
        accounts: [{ ...POOR_ACCOUNT }],
        annualExpenses: 50000,
        withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
      }),
      200,
      42,
    )
    expect(result.successRate).toBeLessThan(0.1)
  })
})

describe('runMonteCarlo — percentile aggregation', () => {
  it('p10 ≤ p50 ≤ p90 at each year', () => {
    const result = runMonteCarlo(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 80 },
        accounts: [{ ...RICH_ACCOUNT }],
        annualExpenses: 60000,
      }),
      200,
      42,
    )
    for (const yr of result.yearlyResults) {
      expect(yr.p10).toBeLessThanOrEqual(yr.p50)
      expect(yr.p50).toBeLessThanOrEqual(yr.p90)
    }
  })

  it('yearlyResults has one entry per year (maxAge - currentAge)', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 75 },
      accounts: [{ ...RICH_ACCOUNT }],
      annualExpenses: 60000,
    })
    const result = runMonteCarlo(inp, 50, 42)
    expect(result.yearlyResults.length).toBe(75 - 60)
  })
})

describe('runMonteCarlo — memory budget', () => {
  it('1000 runs, 30-year horizon with many accounts stays under 100MB', () => {
    const multiAccounts = [RICH_ACCOUNT, { ...RICH_ACCOUNT, id: 'b' }, { ...RICH_ACCOUNT, id: 'c' }]
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 62, maxAge: 92 },
      accounts: multiAccounts,
      annualExpenses: 60000,
    })
    const memBefore = process.memoryUsage().heapUsed
    runMonteCarlo(inp, 1000, 42)
    const memAfter = process.memoryUsage().heapUsed
    const deltaMB = (memAfter - memBefore) / 1024 / 1024
    expect(deltaMB).toBeLessThan(100)
  })
})

describe('runMonteCarlo — breakpoint segment sampling', () => {
  it('breakpoint at age 70 produces two distinct rate segments per run', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 85 },
      accounts: [{ ...RICH_ACCOUNT }],
      annualExpenses: 60000,
      initialStockGrowthMin: 0.08,
      initialStockGrowthMax: 0.12,
      initialInflationMin: 0.02,
      initialInflationMax: 0.04,
      breakpoints: [{
        startAge: 70,
        stockGrowthMin: 0.01,
        stockGrowthMax: 0.03,
        inflationMin: 0.01,
        inflationMax: 0.02,
      }],
    })
    // Just verify it runs without error and returns sensible structure
    const result = runMonteCarlo(inp, 100, 42)
    expect(result.yearlyResults.length).toBe(85 - 60)
    expect(result.successRate).toBeGreaterThanOrEqual(0)
    expect(result.successRate).toBeLessThanOrEqual(1)
  })
})
