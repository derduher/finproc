import { describe, it, expect } from 'vitest'
import { runSingleProjection } from './projection'
import { defaultInputs, WithdrawalStrategy } from '../schema'
import type { SimulationInputs } from '../schema'

/** Flat rates (no randomness) for deterministic tests */
const ZERO_RATES = { stockGrowth: 0, inflation: 0 }

function inputs(overrides: Partial<SimulationInputs> = {}): SimulationInputs {
  return { ...defaultInputs(), ...overrides }
}

describe('runSingleProjection — zero growth, no withdrawals', () => {
  it('balance = contributions only over 30 years', () => {
    const monthly = 1000
    const months = 30 * 12
    const result = runSingleProjection(
      inputs({
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 0,
          contributionAmount: monthly,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 95,
          withdrawalStartAge: 59,
        }],
        annualExpenses: 0,
        person: { ...defaultInputs().person, currentAge: 32, maxAge: 62 },
      }),
      ZERO_RATES,
    )
    // 30 years × 12 months × $1000
    const expected = months * monthly
    expect(result.yearlyResults.at(-1)!.totalBalance).toBeCloseTo(expected, -2)
  })

  it('single roth 7% growth, $500/mo, 30 years → matches FV annuity', () => {
    const monthly = 500
    const annualRate = 0.07
    const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1
    const n = 30 * 12
    // FV of ordinary annuity: PMT × [(1+r)^n - 1] / r
    const expected = monthly * (Math.pow(1 + monthlyRate, n) - 1) / monthlyRate

    const result = runSingleProjection(
      inputs({
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 0,
          contributionAmount: monthly,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 95,
          withdrawalStartAge: 59,
        }],
        annualExpenses: 0,
        person: { ...defaultInputs().person, currentAge: 32, maxAge: 62 },
      }),
      { stockGrowth: annualRate, inflation: 0 },
    )

    const endBalance = result.yearlyResults.at(-1)!.totalBalance
    // Allow 1% tolerance for monthly compounding approximation
    expect(endBalance).toBeCloseTo(expected, -3)
  })
})

describe('runSingleProjection — traditional withdrawal gross-up', () => {
  it('25% marginal rate, $40K net need → $53,333 gross withdrawn', () => {
    const netNeed = 40000
    const marginalRate = 0.25
    const expectedGross = netNeed / (1 - marginalRate) // 53,333.33

    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 66, marginalTaxRate: marginalRate },
        accounts: [{
          id: 'a', name: '401k', type: 'traditional',
          balance: 500000,
          contributionAmount: 0,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 64,
          withdrawalStartAge: 59,
        }],
        annualExpenses: netNeed,
        withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
      }),
      ZERO_RATES,
    )

    // yearlyResults[0] is end of first year (age 66)
    const endBalance = result.yearlyResults[0]!.totalBalance
    expect(endBalance).toBeCloseTo(500000 - expectedGross, 0)
  })
})

describe('runSingleProjection — portfolio depletion', () => {
  it('portfolio hits zero before MAX_AGE and run is marked failed', () => {
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 80, marginalTaxRate: 0.24 },
        accounts: [{
          id: 'a', name: '401k', type: 'traditional',
          balance: 100000,
          contributionAmount: 0,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 64,
          withdrawalStartAge: 65,
        }],
        annualExpenses: 60000, // way more than portfolio can sustain
      }),
      ZERO_RATES,
    )

    expect(result.succeeded).toBe(false)
    expect(result.depleteAge).toBeDefined()
    expect(result.depleteAge!).toBeLessThan(80)
  })
})

describe('runSingleProjection — withdrawal strategies', () => {
  it('tax-optimal drains taxable before traditional before roth', () => {
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 70, marginalTaxRate: 0.24 },
        accounts: [
          { id: 'tax', name: 'Brokerage', type: 'taxable', balance: 50000, costBasis: 50000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 64, withdrawalStartAge: 65 },
          { id: 'trad', name: '401k', type: 'traditional', balance: 200000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 64, withdrawalStartAge: 65 },
          { id: 'roth', name: 'Roth', type: 'roth', balance: 100000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 64, withdrawalStartAge: 65 },
        ],
        annualExpenses: 20000,
        withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
      }),
      ZERO_RATES,
    )

    // After first year, taxable should be smaller (drawn first), trad/roth less so
    const yr1 = result.yearlyResults[0]!
    expect(yr1.accountBalances['tax']).toBeLessThan(50000)
    expect(yr1.accountBalances['trad']).toBeCloseTo(200000, -2) // largely untouched
  })

  it('proportional strategy draws from all accounts in balance proportion', () => {
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 67, marginalTaxRate: 0.24 },
        accounts: [
          { id: 'tax', name: 'Brokerage', type: 'taxable', balance: 100000, costBasis: 100000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 64, withdrawalStartAge: 65 },
          { id: 'trad', name: '401k', type: 'traditional', balance: 100000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 64, withdrawalStartAge: 65 },
        ],
        annualExpenses: 20000,
        withdrawalStrategy: WithdrawalStrategy.Proportional,
      }),
      ZERO_RATES,
    )

    // Both accounts had equal balance, so both should be drawn roughly equally
    const yr1 = result.yearlyResults[0]!
    const taxDrawn = 100000 - yr1.accountBalances['tax']
    const tradDrawn = 100000 - yr1.accountBalances['trad']
    // They won't be exactly equal due to tax gross-ups, but similar
    expect(Math.abs(taxDrawn - tradDrawn)).toBeLessThan(5000)
  })
})

describe('runSingleProjection — social security', () => {
  it('SS income reduces net withdrawal need starting at claim age', () => {
    const account = { id: 'a', name: 'Trad', type: 'traditional' as const, balance: 1_000_000,
      contributionAmount: 0, contributionType: 'flat' as const, contributionFrequency: 'monthly' as const,
      contributionEndAge: 64, withdrawalStartAge: 65 }

    // SS claims immediately at currentAge (65), so active for all 10 years
    const withSS = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 75 },
        accounts: [account],
        annualExpenses: 50000,
        socialSecurity: { annualAmountPresentDollars: 28000, claimAge: 65 },
      }),
      ZERO_RATES,
    )

    const withoutSS = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 75 },
        accounts: [{ ...account }],
        annualExpenses: 50000,
      }),
      ZERO_RATES,
    )

    const endWithSS = withSS.yearlyResults.at(-1)!.totalBalance
    const endWithoutSS = withoutSS.yearlyResults.at(-1)!.totalBalance
    // With $28K/yr SS, ~$22K/yr net drawn vs $50K/yr → large ending balance difference
    expect(endWithSS).toBeGreaterThan(endWithoutSS + 200_000)
  })
})

describe('runSingleProjection — one-time expenses', () => {
  it('one-time expense at age 50 reduces balance in that year', () => {
    const withExpense = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 48, maxAge: 52 },
        accounts: [{ id: 'a', name: 'Trad', type: 'traditional', balance: 300000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 47, withdrawalStartAge: 48 }],
        annualExpenses: 0,
        oneTimeExpenses: [{ id: 'e1', label: 'House', age: 50, amountPresentDollars: 50000 }],
      }),
      ZERO_RATES,
    )

    const withoutExpense = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 48, maxAge: 52 },
        accounts: [{ id: 'a', name: 'Trad', type: 'traditional', balance: 300000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 47, withdrawalStartAge: 48 }],
        annualExpenses: 0,
      }),
      ZERO_RATES,
    )

    const withEnd = withExpense.yearlyResults.at(-1)!.totalBalance
    const withoutEnd = withoutExpense.yearlyResults.at(-1)!.totalBalance
    expect(withEnd).toBeLessThan(withoutEnd)
  })
})

describe('runSingleProjection — breakpoints', () => {
  it('breakpoint at age 65 changes growth rate for subsequent months', () => {
    const highGrowth = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 70 },
        accounts: [{ id: 'a', name: 'Roth', type: 'roth', balance: 100000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 59, withdrawalStartAge: 59 }],
        annualExpenses: 0,
        initialStockGrowthMin: 0.10, initialStockGrowthMax: 0.10,
        initialInflationMin: 0, initialInflationMax: 0,
        breakpoints: [{ startAge: 65, stockGrowthMin: 0.02, stockGrowthMax: 0.02, inflationMin: 0, inflationMax: 0 }],
      }),
      { stockGrowth: 0.10, inflation: 0 }, // initial segment rate
    )

    const lowGrowth = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 70 },
        accounts: [{ id: 'a', name: 'Roth', type: 'roth', balance: 100000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 59, withdrawalStartAge: 59 }],
        annualExpenses: 0,
        initialStockGrowthMin: 0.02, initialStockGrowthMax: 0.02,
        initialInflationMin: 0, initialInflationMax: 0,
      }),
      { stockGrowth: 0.02, inflation: 0 },
    )

    const highEnd = highGrowth.yearlyResults.at(-1)!.totalBalance
    const lowEnd = lowGrowth.yearlyResults.at(-1)!.totalBalance
    expect(highEnd).toBeGreaterThan(lowEnd)
  })
})
