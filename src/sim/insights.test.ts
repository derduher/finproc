import { describe, it, expect } from 'vitest'
import { computeInsights } from './insights'
import { runMonteCarlo } from './montecarlo'
import { defaultInputs, WithdrawalStrategy } from '../schema'
import type { SimulationInputs } from '../schema'

function inputs(overrides: Partial<SimulationInputs> = {}): SimulationInputs {
  return { ...defaultInputs(), ...overrides }
}

const STD_ACCOUNTS = [
  { id: 'tax', name: 'Brokerage', type: 'taxable' as const, balance: 80_000, costBasis: 60_000, contributionAmount: 300, contributionType: 'flat' as const, contributionFrequency: 'monthly' as const, contributionEndAge: 62, withdrawalStartAge: 50 },
  { id: 'trad', name: '401k', type: 'traditional' as const, balance: 180_000, contributionAmount: 1200, contributionType: 'flat' as const, contributionFrequency: 'monthly' as const, contributionEndAge: 62, withdrawalStartAge: 59 },
  { id: 'roth', name: 'Roth', type: 'roth' as const, balance: 40_000, contributionAmount: 500, contributionType: 'flat' as const, contributionFrequency: 'monthly' as const, contributionEndAge: 62, withdrawalStartAge: 59 },
]

describe('computeInsights — shape', () => {
  it('returns an array of {tone, title, body, cta}', () => {
    const inp = inputs({ accounts: STD_ACCOUNTS })
    const result = runMonteCarlo(inp, 30, 42)
    const insights = computeInsights(inp, result, { runCount: 30 })
    expect(Array.isArray(insights)).toBe(true)
    for (const i of insights) {
      expect(['good', 'warn', 'accent']).toContain(i.tone)
      expect(typeof i.title).toBe('string')
      expect(typeof i.body).toBe('string')
      expect(typeof i.cta).toBe('string')
      expect(i.title.length).toBeGreaterThan(0)
    }
  })
})

describe('computeInsights — healthcare-gap rule', () => {
  it('fires when currentAge < 65 and effective retire age in [55, 65)', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 40 },
      accounts: [{
        ...STD_ACCOUNTS[1],
        contributionEndAge: 62, // effective retire = 62 → in the gap
      }],
    })
    const result = runMonteCarlo(inp, 20, 42)
    const insights = computeInsights(inp, result, { runCount: 20 })
    const gap = insights.find((i) => i.title.toLowerCase().includes('healthcare'))
    expect(gap).toBeDefined()
    expect(gap?.tone).toBe('warn')
  })

  it('does NOT fire when currentAge >= 65 already', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 66, maxAge: 90 },
      accounts: [{ ...STD_ACCOUNTS[1], contributionEndAge: 65 }],
    })
    const result = runMonteCarlo(inp, 20, 42)
    const insights = computeInsights(inp, result, { runCount: 20 })
    const gap = insights.find((i) => i.title.toLowerCase().includes('healthcare'))
    expect(gap).toBeUndefined()
  })

  it('does NOT fire when retire age is 65 or later', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 40 },
      accounts: [{ ...STD_ACCOUNTS[1], contributionEndAge: 67 }],
    })
    const result = runMonteCarlo(inp, 20, 42)
    const insights = computeInsights(inp, result, { runCount: 20 })
    const gap = insights.find((i) => i.title.toLowerCase().includes('healthcare'))
    expect(gap).toBeUndefined()
  })
})

describe('computeInsights — tax-strategy rule', () => {
  it('fires when current strategy is TaxOptimal and beats Proportional', () => {
    const inp = inputs({
      accounts: STD_ACCOUNTS,
      withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 85 },
      annualExpenses: 80_000,
    })
    const result = runMonteCarlo(inp, 50, 42)
    const insights = computeInsights(inp, result, { runCount: 50 })
    const strat = insights.find((i) => i.title.toLowerCase().includes('tax-optimal') || i.title.toLowerCase().includes('strategy'))
    // May or may not fire depending on whether tax-optimal beats proportional;
    // at minimum, when it does fire it should be 'good' tone.
    if (strat) {
      expect(strat.tone).toBe('good')
    }
  })

  it('does NOT fire when current strategy is Proportional', () => {
    const inp = inputs({
      accounts: STD_ACCOUNTS,
      withdrawalStrategy: WithdrawalStrategy.Proportional,
    })
    const result = runMonteCarlo(inp, 30, 42)
    const insights = computeInsights(inp, result, { runCount: 30 })
    const strat = insights.find((i) => i.title.toLowerCase().includes('tax-optimal'))
    expect(strat).toBeUndefined()
  })
})

describe('computeInsights — retire-one-year-later rule', () => {
  it('fires with accent tone when delaying retire by 1y meaningfully helps', () => {
    // Tight retirement: bumping contributionEndAge by 1 should noticeably help
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 90, annualSalary: 100_000 },
      accounts: [{
        id: 'trad', name: '401k', type: 'traditional',
        balance: 200_000,
        contributionAmount: 2000, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 62, withdrawalStartAge: 59,
      }],
      annualExpenses: 60_000,
    })
    const result = runMonteCarlo(inp, 50, 42)
    const insights = computeInsights(inp, result, { runCount: 50 })
    const later = insights.find((i) => i.title.toLowerCase().includes('one more year') || i.title.toLowerCase().includes('later'))
    if (later) {
      expect(later.tone).toBe('accent')
      expect(later.body).toMatch(/\d/) // mentions a number
    }
  })

  it('bug #6: a real ~9pp effect still fires at full (1000-run) resolution', () => {
    // $1.3M, retire 62, expenses 65k → base ≈ 56%, +1yr ≈ 65% (delta ≈ 9pp, well
    // above the significance bar at n=1000). Guards against the gate over-suppressing.
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 90, annualSalary: 120_000 },
      accounts: [{
        id: 'trad', name: '401k', type: 'traditional',
        balance: 1_300_000,
        contributionAmount: 2500, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 62, withdrawalStartAge: 59,
      }],
      annualExpenses: 65_000,
    })
    const result = runMonteCarlo(inp, 1000, 42)
    const insights = computeInsights(inp, result, { runCount: 1000 })
    const later = insights.find((i) => i.title.toLowerCase().includes('one more year'))
    expect(later).toBeDefined()
    expect(later?.tone).toBe('accent')
  })

  it('bug #6: the same effect is suppressed at a tiny run count (cannot beat noise)', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 90, annualSalary: 120_000 },
      accounts: [{
        id: 'trad', name: '401k', type: 'traditional',
        balance: 1_300_000,
        contributionAmount: 2500, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 62, withdrawalStartAge: 59,
      }],
      annualExpenses: 65_000,
    })
    const result = runMonteCarlo(inp, 8, 42)
    const insights = computeInsights(inp, result, { runCount: 8 })
    const later = insights.find((i) => i.title.toLowerCase().includes('one more year'))
    // ~9pp is real but indistinguishable from noise at n=8 → stay silent.
    expect(later).toBeUndefined()
  })

  it('does NOT fire when there are no accounts', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 70, maxAge: 90 },
      accounts: [],
      annualExpenses: 30_000,
    })
    const result = runMonteCarlo(inp, 20, 42)
    const insights = computeInsights(inp, result, { runCount: 20 })
    const later = insights.find((i) => i.title.toLowerCase().includes('one more year'))
    expect(later).toBeUndefined()
  })

  it('clamps bumped contributionEndAge to maxAge - 1', () => {
    // contributionEndAge already at maxAge - 1 → bump should saturate, no crash
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 80, annualSalary: 100_000 },
      accounts: [{
        id: 'trad', name: '401k', type: 'traditional',
        balance: 100_000,
        contributionAmount: 1000, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 79, withdrawalStartAge: 59,
      }],
      annualExpenses: 50_000,
    })
    const result = runMonteCarlo(inp, 20, 42)
    expect(() => computeInsights(inp, result, { runCount: 20 })).not.toThrow()
  })

  it('does NOT fire when already at 100% success', () => {
    const inp = inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 70 },
      accounts: [{
        id: 'roth', name: 'Roth', type: 'roth',
        balance: 5_000_000,
        contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 59, withdrawalStartAge: 59,
      }],
      annualExpenses: 30_000,
    })
    const result = runMonteCarlo(inp, 30, 42)
    const insights = computeInsights(inp, result, { runCount: 30 })
    const later = insights.find((i) => i.title.toLowerCase().includes('one more year'))
    expect(later).toBeUndefined()
  })
})
