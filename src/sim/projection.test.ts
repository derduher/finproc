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

describe('runSingleProjection — pre-retirement one-time expense', () => {
  it('lump-sum expense paid before withdrawalStartAge still draws from accounts', () => {
    // Person at 51 with $1M Roth locked until 65, no salary. A $1M one-time
    // expense lands at 51. The simulation must actually pay for it — silently
    // ignoring the lockout was the bug.
    const withExpense = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 51, maxAge: 70, annualSalary: 0, retirementAge: 65 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 1_000_000,
          contributionAmount: 0,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 65,
          withdrawalStartAge: 65,
        }],
        annualExpenses: 0,
        oneTimeExpenses: [{ id: 'e1', label: 'House', age: 51, amountPresentDollars: 800_000 }],
      }),
      ZERO_RATES,
    )

    // First-year ending balance after $800K expense should be ~$200K (not $1M).
    const firstYearBalance = withExpense.yearlyResults[0]!.totalBalance
    expect(firstYearBalance).toBeLessThan(300_000)
  })

  it('lump-sum reflected in withdrawals series for the event year', () => {
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 51, maxAge: 55, annualSalary: 0, retirementAge: 65 },
        accounts: [{
          id: 'a', name: 'Trad', type: 'traditional',
          balance: 2_000_000,
          contributionAmount: 0,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 65,
          withdrawalStartAge: 65,
        }],
        annualExpenses: 0,
        oneTimeExpenses: [{ id: 'e1', label: 'House', age: 51, amountPresentDollars: 500_000 }],
      }),
      ZERO_RATES,
    )
    // The event-year (age 52 end-of-year) row should record nonzero withdrawals.
    const eventYear = result.yearlyResults.find((y) => y.age === 52)!
    expect(eventYear.withdrawals).toBeGreaterThan(400_000)
  })
})

describe('runSingleProjection — multi-account withdrawal NaN safety', () => {
  it('tax-optimal withdraw across drained taxable then roth never produces NaN balances', () => {
    // Repro: taxable account first (tax-optimal order), small balance gets fully
    // drained, then a second account (roth) is hit. The previous netFromGross
    // computed gain fraction from post-withdrawal balance/basis; when the taxable
    // account was fully drained, both were 0 → 0/0 = NaN, which then poisoned
    // every subsequent account's balance via `balance -= NaN`.
    const result = runSingleProjection(
      inputs({
        accounts: [
          {
            id: 't', name: 'Taxable', type: 'taxable',
            balance: 5000,
            contributionAmount: 0,
            contributionType: 'flat',
            contributionFrequency: 'monthly',
            contributionEndAge: 60,
            withdrawalStartAge: 60,
          },
          {
            id: 'r', name: 'Roth', type: 'roth',
            balance: 500000,
            contributionAmount: 0,
            contributionType: 'flat',
            contributionFrequency: 'monthly',
            contributionEndAge: 60,
            withdrawalStartAge: 60,
          },
        ],
        annualExpenses: 50000,
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 80, annualSalary: 0 },
        withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
      }),
      { stockGrowth: 0.05, inflation: 0.02 },
    )

    for (const yr of result.yearlyResults) {
      expect(Number.isFinite(yr.totalBalance)).toBe(true)
      for (const [, bal] of Object.entries(yr.accountBalances)) {
        expect(Number.isFinite(bal)).toBe(true)
      }
    }
  })
})

describe('runSingleProjection — RMDs (bug #3: cash must not evaporate)', () => {
  it('forces an RMD at 73 even with zero spending need, and only the tax leaves the portfolio', () => {
    const marginalTaxRate = 0.25
    const result = runSingleProjection(
      inputs({
        accounts: [{
          id: 'trad', name: 'Trad', type: 'traditional',
          balance: 1_000_000,
          contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
          contributionEndAge: 73, withdrawalStartAge: 60,
        }],
        annualExpenses: 0,
        socialSecurity: undefined,
        oneTimeExpenses: [],
        person: {
          ...defaultInputs().person,
          currentAge: 73, maxAge: 74, annualSalary: 0,
          marginalTaxRate, retirementAge: 73,
        },
      }),
      ZERO_RATES,
    )
    const divisor = 26.5 // IRS Uniform Lifetime Table, age 73
    const rmd = 1_000_000 / divisor
    const tax = rmd * marginalTaxRate
    // The RMD is forced out of the traditional account but the net proceeds are
    // reinvested (not destroyed): the portfolio shrinks only by the tax paid.
    const expectedTotal = 1_000_000 - tax
    const last = result.yearlyResults.at(-1)!
    expect(last.totalBalance).toBeCloseTo(expectedTotal, -1)
    // Sanity: it neither skipped the RMD (would be 1,000,000) nor destroyed it
    // (would be 1,000,000 - rmd).
    expect(last.totalBalance).toBeLessThan(1_000_000 - 1)
    expect(last.totalBalance).toBeGreaterThan(1_000_000 - rmd + 1)
  })

  it('reinvests RMD proceeds into an existing taxable account (no synthetic sink)', () => {
    const marginalTaxRate = 0.25
    const result = runSingleProjection(
      inputs({
        accounts: [
          {
            id: 'trad', name: 'Trad', type: 'traditional',
            balance: 1_000_000,
            contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
            contributionEndAge: 73, withdrawalStartAge: 60,
          },
          {
            id: 'brok', name: 'Brokerage', type: 'taxable',
            balance: 100_000, costBasis: 100_000,
            contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
            contributionEndAge: 73, withdrawalStartAge: 60,
          },
        ],
        annualExpenses: 0,
        socialSecurity: undefined,
        oneTimeExpenses: [],
        person: {
          ...defaultInputs().person,
          currentAge: 73, maxAge: 74, annualSalary: 0,
          marginalTaxRate, retirementAge: 73,
        },
      }),
      ZERO_RATES,
    )
    const rmd = 1_000_000 / 26.5
    const net = rmd * (1 - marginalTaxRate)
    const yr = result.yearlyResults.at(-1)!
    // Net proceeds land in the user's existing brokerage, not a synthetic account.
    expect(yr.accountBalances['brok']).toBeCloseTo(100_000 + net, -1)
    expect(yr.accountBalances['trad']).toBeCloseTo(1_000_000 - rmd, -1)
    expect(yr.accountBalances['__rmd_reinvest']).toBeUndefined()
  })
})

describe('runSingleProjection — working-years cash flow', () => {
  it('bug #4: employer match must not reduce take-home pay (no phantom withdrawals)', () => {
    const result = runSingleProjection(
      inputs({
        accounts: [
          {
            id: 'k', name: '401k', type: 'traditional',
            balance: 0,
            contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
            contributionEndAge: 41, withdrawalStartAge: 60,
            employerMatch: { type: 'flat', annualAmount: 10_000 },
          },
          {
            id: 'tax', name: 'Taxable', type: 'taxable',
            balance: 50_000, costBasis: 50_000,
            contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
            contributionEndAge: 41, withdrawalStartAge: 40,
          },
        ],
        annualExpenses: 75_000, // exactly covered by after-tax salary, zero margin
        socialSecurity: undefined,
        oneTimeExpenses: [],
        person: {
          ...defaultInputs().person,
          currentAge: 40, maxAge: 41, annualSalary: 100_000,
          marginalTaxRate: 0.25, salaryGrowthRate: 0, retirementAge: 41,
        },
      }),
      ZERO_RATES,
    )
    const yr = result.yearlyResults.at(-1)!
    // After-tax salary (100k × 0.75 = 75k) exactly covers 75k expenses, so the
    // taxable account is untouched and the $10k match lands in the 401k.
    expect(yr.accountBalances['tax']).toBeCloseTo(50_000, -1)
    expect(yr.accountBalances['k']).toBeCloseTo(10_000, -1)
    expect(yr.withdrawals).toBeCloseTo(0, -1)
  })

  it('bug #5: traditional contributions are pre-tax (reduce taxable income)', () => {
    const tradAnnual = 20_000
    const result = runSingleProjection(
      inputs({
        accounts: [
          {
            id: 'k', name: '401k', type: 'traditional',
            balance: 0,
            contributionAmount: tradAnnual / 12, contributionType: 'flat', contributionFrequency: 'monthly',
            contributionEndAge: 41, withdrawalStartAge: 60,
          },
          {
            id: 'tax', name: 'Taxable', type: 'taxable',
            balance: 50_000, costBasis: 50_000,
            contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
            contributionEndAge: 41, withdrawalStartAge: 40,
          },
        ],
        // Take-home with pre-tax 401k = (100k − 20k) × 0.75 = 60k, exactly covering
        // expenses. If the 401k were (wrongly) taxed, take-home would be only 55k
        // and the taxable account would be tapped for the 5k gap.
        annualExpenses: 60_000,
        socialSecurity: undefined,
        oneTimeExpenses: [],
        person: {
          ...defaultInputs().person,
          currentAge: 40, maxAge: 41, annualSalary: 100_000,
          marginalTaxRate: 0.25, salaryGrowthRate: 0, retirementAge: 41,
        },
      }),
      ZERO_RATES,
    )
    const yr = result.yearlyResults.at(-1)!
    expect(yr.accountBalances['tax']).toBeCloseTo(50_000, -1)
    expect(yr.accountBalances['k']).toBeCloseTo(tradAnnual, -1)
    expect(yr.withdrawals).toBeCloseTo(0, -1)
  })
})
