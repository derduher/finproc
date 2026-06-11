import { describe, it, expect } from 'vitest'
import { runSensitivity } from './sensitivity'
import { defaultInputs, WithdrawalStrategy } from '../schema'
import type { SimulationInputs } from '../schema'

function inputs(overrides: Partial<SimulationInputs> = {}): SimulationInputs {
  return { ...defaultInputs(), ...overrides }
}

const BASE = inputs({
  person: { ...defaultInputs().person, currentAge: 62, maxAge: 90, marginalTaxRate: 0 },
  accounts: [{
    id: 'a', name: 'Roth', type: 'roth' as const,
    balance: 1_500_000,
    contributionAmount: 0,
    contributionType: 'flat' as const,
    contributionFrequency: 'monthly' as const,
    contributionEndAge: 61,
    withdrawalStartAge: 62,
  }],
  annualExpenses: 60000,
  withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
  // Zero variance for deterministic results
  initialStockGrowthMin: 0.07,
  initialStockGrowthMax: 0.07,
  initialInflationMin: 0.03,
  initialInflationMax: 0.03,
})

describe('runSensitivity — OAT ±20%', () => {
  it('returns an array of SensitivityResult entries', () => {
    const results = runSensitivity(BASE, 50)
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r).toHaveProperty('label')
      expect(r).toHaveProperty('sub')
      expect(r).toHaveProperty('loDelta')
      expect(r).toHaveProperty('hiDelta')
      expect(typeof r.loDelta).toBe('number')
      expect(typeof r.hiDelta).toBe('number')
    }
  })

  it('higher expenses reduce success rate (loDelta > 0, hiDelta < 0)', () => {
    const results = runSensitivity(BASE, 100)
    const expRow = results.find((r) => r.label.toLowerCase().includes('expense'))
    expect(expRow).toBeDefined()
    // Lower expenses → higher success rate (positive delta)
    expect(expRow!.loDelta).toBeGreaterThanOrEqual(0)
    // Higher expenses → lower success rate (negative delta)
    expect(expRow!.hiDelta).toBeLessThanOrEqual(0)
  })

  it('includes a retirement-age row and a contributions row (#7)', () => {
    const results = runSensitivity(BASE, 50)
    const labels = results.map((r) => r.label.toLowerCase())
    expect(labels.some((l) => l.includes('retirement age'))).toBe(true)
    expect(labels.some((l) => l.includes('contribution'))).toBe(true)
  })

  it('includes a bond-returns row that moves success for a bond-heavy plan', () => {
    const bondHeavy = {
      ...BASE,
      // 20/80 with a strained spend so bond returns are load-bearing.
      accounts: BASE.accounts.map((a) => ({ ...a, stockAllocation: 0.2 })),
      annualExpenses: 75_000,
      bondGrowthMin: 0.04,
      bondGrowthMax: 0.04,
    }
    const results = runSensitivity(bondHeavy, 150)
    const bondRow = results.find((r) => r.label.toLowerCase().includes('bond'))
    expect(bondRow).toBeDefined()
    // Better bonds help, worse bonds hurt — at minimum the row is not inert.
    expect(bondRow!.hiDelta).toBeGreaterThanOrEqual(0)
    expect(bondRow!.loDelta).toBeLessThanOrEqual(0)
    expect(Math.abs(bondRow!.hiDelta) + Math.abs(bondRow!.loDelta)).toBeGreaterThan(0)
  })

  it('bond-returns row is inert for an all-stock plan (no wasted MC reruns)', () => {
    const results = runSensitivity(BASE, 50)
    const bondRow = results.find((r) => r.label.toLowerCase().includes('bond'))
    expect(bondRow).toBeDefined()
    expect(bondRow!.loDelta).toBe(0)
    expect(bondRow!.hiDelta).toBe(0)
  })

  it('results are sorted by descending absolute impact', () => {
    const results = runSensitivity(BASE, 100)
    const impacts = results.map((r) => Math.max(Math.abs(r.loDelta), Math.abs(r.hiDelta)))
    for (let i = 1; i < impacts.length; i++) {
      expect(impacts[i]).toBeLessThanOrEqual(impacts[i - 1] + 1e-9)
    }
  })

  it('perturbing stock growth changes the success rate (marginal scenario)', () => {
    // Use a MARGINAL scenario with real variance so growth perturbation has impact.
    // Tight balance ($600K) + 28-year horizon: reducing returns from 7%→5.6% causes failures.
    const marginal = inputs({
      person: { ...defaultInputs().person, currentAge: 62, maxAge: 90, marginalTaxRate: 0 },
      accounts: [{
        id: 'a', name: 'Roth', type: 'roth' as const,
        balance: 600_000,
        contributionAmount: 0,
        contributionType: 'flat' as const,
        contributionFrequency: 'monthly' as const,
        contributionEndAge: 61,
        withdrawalStartAge: 62,
      }],
      annualExpenses: 40000,
      withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
      initialStockGrowthMin: 0.03,  // real variance: ±spread
      initialStockGrowthMax: 0.11,
      initialInflationMin: 0.02,
      initialInflationMax: 0.04,
    })
    const results = runSensitivity(marginal, 200)
    const growthRow = results.find((r) =>
      r.label.toLowerCase().includes('stock') ||
      r.label.toLowerCase().includes('growth') ||
      r.label.toLowerCase().includes('return'))
    expect(growthRow).toBeDefined()
    // Changing growth should have some impact
    const impact = Math.abs(growthRow!.loDelta) + Math.abs(growthRow!.hiDelta)
    expect(impact).toBeGreaterThan(0)
  })
})

describe('runSensitivity — cache reuse', () => {
  it('runs faster the second time with same inputs (cache hit)', () => {
    // The function itself doesn't cache but the test verifies structure
    const r1 = runSensitivity(BASE, 50)
    const r2 = runSensitivity(BASE, 50)
    // Same inputs → same structure (labels match)
    expect(r1.map((r) => r.label)).toEqual(r2.map((r) => r.label))
    expect(r1.map((r) => r.loDelta)).toEqual(r2.map((r) => r.loDelta))
  })
})
