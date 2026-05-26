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

describe('runSingleProjection — pre-retirement salary covers expenses', () => {
  it('working person with adequate salary does NOT deplete from locked accounts', () => {
    // 32yo, $95K salary, $70K expenses, $800K Roth locked until 59.
    // Disposable income ≈ $95K × 0.76 = $72.2K (minus contributions).
    // Expenses $70K are fully covered by salary — no portfolio withdrawal needed.
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 32, maxAge: 70, annualSalary: 95000, marginalTaxRate: 0.24 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 800000,
          contributionAmount: 0, // no contributions, so all salary is disposable
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 62,
          withdrawalStartAge: 59,
        }],
        annualExpenses: 70000,
      }),
      { stockGrowth: 0.07, inflation: 0.03 },
    )
    // Should NOT be flagged as depleted (the old bug would mark it failed at age 32)
    expect(result.succeeded).toBe(true)
    expect(result.depleteAge).toBeUndefined()
    expect(result.yearlyResults.at(-1)!.totalBalance).toBeGreaterThan(800000) // grew
  })

  it('salary stops applying after effective retirement age', () => {
    // contributionEndAge = 45 means effective retirement = 45.
    // From 45 onward, salary is gone and the small Roth must cover huge expenses → deplete.
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 32, maxAge: 70, annualSalary: 95000, marginalTaxRate: 0.24 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 50000, // tiny
          contributionAmount: 0,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 45,
          withdrawalStartAge: 45,
        }],
        annualExpenses: 100000, // expensive
      }),
      { stockGrowth: 0.03, inflation: 0.03 },
    )
    expect(result.succeeded).toBe(false)
    expect(result.depleteAge).toBeDefined()
    expect(result.depleteAge!).toBeGreaterThanOrEqual(45) // after retirement, not before
  })
})

describe('runSingleProjection — post-depletion balance behaviour', () => {
  it('after depletion, balances stay at zero through MAX_AGE (spec §3.3)', () => {
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 90, annualSalary: 0, marginalTaxRate: 0.24 },
        accounts: [{
          id: 'a', name: 'Trad', type: 'traditional',
          balance: 50000, // very small, will deplete fast
          contributionAmount: 0,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 64,
          withdrawalStartAge: 65,
        }],
        annualExpenses: 80000, // way more than balance
      }),
      { stockGrowth: 0.07, inflation: 0 },
    )
    expect(result.succeeded).toBe(false)
    expect(result.depleteAge).toBeDefined()
    // Every year after depletion should have totalBalance === 0 (not still growing)
    const depleteIdx = result.yearlyResults.findIndex((r) => r.age >= result.depleteAge!)
    for (let i = depleteIdx; i < result.yearlyResults.length; i++) {
      expect(result.yearlyResults[i].totalBalance).toBe(0)
    }
  })
})

describe('runSingleProjection — per-segment rates', () => {
  it('breakpointRates[k] is applied to years on/after breakpoints[k].startAge', () => {
    // 10-year horizon, no expenses, one Roth account starting at $100K.
    // Initial segment: 10% (covers age 60-65).
    // Breakpoint at 65: 0% (covers age 65-70).
    // Expected ending balance: 100K × (1.10)^5 × (1.00)^5 = 161,051
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 70 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 100000,
          contributionAmount: 0,
          contributionType: 'flat', contributionFrequency: 'monthly',
          contributionEndAge: 59, withdrawalStartAge: 59,
        }],
        annualExpenses: 0,
        breakpoints: [{ startAge: 65, stockGrowthMin: 0, stockGrowthMax: 0, inflationMin: 0, inflationMax: 0 }],
      }),
      { stockGrowth: 0.10, inflation: 0 },
      [{ stockGrowth: 0, inflation: 0 }],
    )
    const endBalance = result.yearlyResults.at(-1)!.totalBalance
    // 100K × 1.1^5 (monthly compounded) × 1.0^5 ≈ 164,530
    // Allow 2% tolerance for monthly compounding approximation
    const expected = 100000 * Math.pow(1 + Math.pow(1.10, 1/12) - 1, 5 * 12) * 1
    expect(endBalance).toBeCloseTo(expected, -3)
    expect(endBalance).toBeLessThan(100000 * Math.pow(1.10, 10)) // strictly less than 10yr@10%
  })

  it('omitting breakpointRates → initial rates used throughout (back-compat)', () => {
    // Same setup, no breakpointRates arg → initial 10% applies for all 10 years
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 70 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 100000,
          contributionAmount: 0,
          contributionType: 'flat', contributionFrequency: 'monthly',
          contributionEndAge: 59, withdrawalStartAge: 59,
        }],
        annualExpenses: 0,
        breakpoints: [{ startAge: 65, stockGrowthMin: 0, stockGrowthMax: 0, inflationMin: 0, inflationMax: 0 }],
      }),
      { stockGrowth: 0.10, inflation: 0 },
    )
    const endBalance = result.yearlyResults.at(-1)!.totalBalance
    // 10 years at 10% compounded monthly
    const expected = 100000 * Math.pow(1 + Math.pow(1.10, 1/12) - 1, 10 * 12)
    expect(endBalance).toBeCloseTo(expected, -3)
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
