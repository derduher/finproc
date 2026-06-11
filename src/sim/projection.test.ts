import { describe, it, expect } from 'vitest'
import { runSingleProjection } from './projection'
import { ordinaryTax, grossUpOrdinary } from './tax'
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
        // Salary 0: isolate contributions from surplus take-home banking.
        person: { ...defaultInputs().person, currentAge: 32, maxAge: 62, annualSalary: 0 },
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
        // Salary 0: isolate contributions from surplus take-home banking.
        person: { ...defaultInputs().person, currentAge: 32, maxAge: 62, annualSalary: 0 },
      }),
      { stockGrowth: annualRate, inflation: 0 },
    )

    const endBalance = result.yearlyResults.at(-1)!.totalBalance
    // Allow 1% tolerance for monthly compounding approximation
    expect(endBalance).toBeCloseTo(expected, -3)
  })
})

describe('runSingleProjection — traditional withdrawal gross-up (progressive #8)', () => {
  it('grosses up a $40K net need through the bracket schedule, not a flat marginal rate', () => {
    const netNeed = 40000
    // Progressive: $15k standard deduction shelters the first dollars, then the
    // 10%/12% brackets fill — far cheaper than a flat marginal rate. No SS, no
    // other income, zero inflation → priceLevel 1, single filer.
    const expectedGross = grossUpOrdinary(netNeed, 0, 'single')

    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 66, marginalTaxRate: 0.25 },
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
    // The progressive gross-up is materially smaller than the old flat 25% one
    // (which would have withdrawn $53,333) — the core #8 correction.
    expect(expectedGross).toBeLessThan(45000)
    expect(endBalance).toBeGreaterThan(500000 - 45000)
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

describe('runSingleProjection — cumulative inflation (varying per-year rates)', () => {
  it('inflates flows by the realized cumulative price level, not one year\'s rate^y', () => {
    // Retired Roth holder (net == gross), zero growth, no SS. Each year's expense
    // withdrawal should track the PRODUCT of prior years' inflation, not the
    // current year's single draw raised to y.
    const perYear = [
      { stockGrowth: 0, inflation: 0.10 },
      { stockGrowth: 0, inflation: 0.00 },
      { stockGrowth: 0, inflation: 0.20 },
    ]
    const res = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 68 },
        accounts: [{
          id: 'r', name: 'Roth', type: 'roth', balance: 1_000_000,
          contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
          contributionEndAge: 65, withdrawalStartAge: 65,
        }],
        annualExpenses: 10_000,
      }),
      perYear,
    )
    const w = res.yearlyResults.map((y) => y.withdrawals)
    // Price level at year y = product of inflation over the y PRIOR years.
    expect(w[0]).toBeCloseTo(10_000, 2) // ×1
    expect(w[1]).toBeCloseTo(11_000, 2) // ×1.10
    expect(w[2]).toBeCloseTo(11_000, 2) // ×1.10×1.00
    // The buggy snapshot formula (1+i_y)^y would give 10_000 then 14_400 here.
  })
})

describe('runSingleProjection — one-time expenses', () => {
  it('one-time expense at age 50 reduces balance in that year', () => {
    const withExpense = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 48, maxAge: 52, retirementAge: 48 },
        accounts: [{ id: 'a', name: 'Trad', type: 'traditional', balance: 300000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 47, withdrawalStartAge: 48 }],
        annualExpenses: 0,
        oneTimeExpenses: [{ id: 'e1', label: 'House', age: 50, amountPresentDollars: 50000 }],
      }),
      ZERO_RATES,
    )

    const withoutExpense = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 48, maxAge: 52, retirementAge: 48 },
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

  it('salary stops applying after retirement age', () => {
    // retirementAge = 45: from 45 onward, salary is gone and the small Roth must
    // cover huge expenses → deplete.
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 32, maxAge: 70, retirementAge: 45, annualSalary: 95000, marginalTaxRate: 0.24 },
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

describe('runSingleProjection — per-account stock/bond allocation', () => {
  const growthOnly = (stockAllocation: number | undefined) =>
    inputs({
      person: { ...defaultInputs().person, currentAge: 60, maxAge: 61, retirementAge: 60, annualSalary: 0 },
      accounts: [{
        id: 'a', name: 'Mixed', type: 'roth',
        balance: 100000,
        contributionAmount: 0,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: 60,
        withdrawalStartAge: 60,
        ...(stockAllocation !== undefined ? { stockAllocation } : null),
      }],
      annualExpenses: 0,
    })

  it('a 50/50 account grows at the blend of stock and bond rates', () => {
    const result = runSingleProjection(growthOnly(0.5), {
      stockGrowth: 0.10,
      inflation: 0,
      bondGrowth: 0.02,
    })
    const blendMonthly =
      0.5 * (Math.pow(1.10, 1 / 12) - 1) + 0.5 * (Math.pow(1.02, 1 / 12) - 1)
    const expected = 100000 * Math.pow(1 + blendMonthly, 12)
    expect(result.yearlyResults[0]!.totalBalance).toBeCloseTo(expected, 0)
  })

  it('an all-bond account grows at the bond rate', () => {
    const result = runSingleProjection(growthOnly(0), {
      stockGrowth: 0.10,
      inflation: 0,
      bondGrowth: 0.02,
    })
    expect(result.yearlyResults[0]!.totalBalance).toBeCloseTo(100000 * 1.02, 0)
  })

  it('omitted allocation defaults to 100% stocks (back-compat)', () => {
    const result = runSingleProjection(growthOnly(undefined), {
      stockGrowth: 0.10,
      inflation: 0,
      bondGrowth: 0.02,
    })
    expect(result.yearlyResults[0]!.totalBalance).toBeCloseTo(100000 * 1.10, 0)
  })

  it('a missing bondGrowth in the rates falls back to the stock rate', () => {
    const result = runSingleProjection(growthOnly(0.5), { stockGrowth: 0.10, inflation: 0 })
    expect(result.yearlyResults[0]!.totalBalance).toBeCloseTo(100000 * 1.10, 0)
  })
})

describe('runSingleProjection — RMD start age by birth cohort (SECURE 2.0)', () => {
  it('born-1960+ cohorts start RMDs at 75, not 73', () => {
    // currentAge 60 → born well after 1960 (assumed sim start 2026): the
    // traditional balance must stay untouched through the year starting at 74
    // and shrink only once the year starting at 75 forces a distribution.
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 78, retirementAge: 60, annualSalary: 0 },
        accounts: [{
          id: 'trad', name: 'Trad', type: 'traditional',
          balance: 1_000_000,
          contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
          contributionEndAge: 60, withdrawalStartAge: 60,
        }],
        annualExpenses: 0,
      }),
      ZERO_RATES,
    )
    const tradAt = (age: number) =>
      result.yearlyResults.find((r) => r.age === age)!.accountBalances['trad']
    expect(tradAt(74)).toBeCloseTo(1_000_000, -1) // year starting 73: no RMD yet
    expect(tradAt(75)).toBeCloseTo(1_000_000, -1) // year starting 74: still none
    expect(tradAt(76)).toBeLessThan(1_000_000 - 1) // year starting 75: forced out
  })
})

describe('runSingleProjection — SS thresholds are fixed nominal', () => {
  it('under inflation, a constant real spend needs growing real withdrawals as more SS becomes taxable', () => {
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 65, maxAge: 72, retirementAge: 65, annualSalary: 0 },
        accounts: [{
          id: 'trad', name: 'Trad', type: 'traditional',
          balance: 2_000_000,
          contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
          contributionEndAge: 65, withdrawalStartAge: 60,
        }],
        annualExpenses: 60_000,
        socialSecurity: { claimAge: 65, annualAmountPresentDollars: 30_000 },
      }),
      { stockGrowth: 0, inflation: 0.08 },
    )
    const realWithdrawal = (i: number) =>
      result.yearlyResults[i]!.withdrawals / Math.pow(1.08, i)
    // Brackets are real-indexed but the SS bases are not, so the real gross need
    // creeps upward year over year.
    expect(realWithdrawal(6)).toBeGreaterThan(realWithdrawal(0) * 1.01)
  })
})

describe('runSingleProjection — early-withdrawal penalty (10% before 59½)', () => {
  const earlyRetiree = (currentAge: number, accountType: 'traditional' | 'roth') =>
    inputs({
      person: { ...defaultInputs().person, currentAge, maxAge: currentAge + 2, retirementAge: currentAge, annualSalary: 0 },
      accounts: [{
        id: 'a', name: 'Acct', type: accountType,
        balance: 500000,
        contributionAmount: 0,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: currentAge,
        withdrawalStartAge: 50,
      }],
      annualExpenses: 40000,
    })

  /** Gross g solving g − tax(g) − penaltyRate·g = net (single filer, no stacking). */
  function solveGross(net: number, penaltyRate: number): number {
    let lo = net
    let hi = net * 3
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2
      if (mid - ordinaryTax(mid, 'single') - penaltyRate * mid < net) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }

  it('traditional withdrawals before 60 pay the extra 10%', () => {
    const result = runSingleProjection(earlyRetiree(55, 'traditional'), ZERO_RATES)
    const drawn = 500000 - result.yearlyResults[0]!.totalBalance
    expect(drawn).toBeCloseTo(solveGross(40000, 0.1), 0)
    expect(drawn).toBeGreaterThan(grossUpOrdinary(40000, 0, 'single'))
  })

  it('traditional withdrawals at 60+ pay no penalty', () => {
    const result = runSingleProjection(earlyRetiree(60, 'traditional'), ZERO_RATES)
    const drawn = 500000 - result.yearlyResults[0]!.totalBalance
    expect(drawn).toBeCloseTo(grossUpOrdinary(40000, 0, 'single'), 0)
  })

  it('roth withdrawals are penalty-free (basis-first simplification)', () => {
    const result = runSingleProjection(earlyRetiree(55, 'roth'), ZERO_RATES)
    const drawn = 500000 - result.yearlyResults[0]!.totalBalance
    expect(drawn).toBeCloseTo(40000, 0)
  })
})

describe('runSingleProjection — working-year taxes are progressive + FICA', () => {
  it('take-home = salary − progressive federal tax − 7.65% FICA (not flat marginal × salary)', () => {
    // $100k single filer, no contributions, no expenses → year-1 banked surplus
    // is exactly the take-home: 100000 − ordinaryTax(100000) − 7650.
    // The old flat model (0.24 × 100000) gave 76000 instead.
    const salary = 100000
    const expected = salary - ordinaryTax(salary, 'single') - 0.0765 * salary
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 40, maxAge: 45, retirementAge: 41, annualSalary: salary, salaryGrowthRate: 0, marginalTaxRate: 0.24 },
        accounts: [{
          id: 'tax', name: 'Brokerage', type: 'taxable',
          balance: 0, costBasis: 0,
          contributionAmount: 0,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 41,
          withdrawalStartAge: 41,
        }],
        annualExpenses: 0,
      }),
      ZERO_RATES,
    )
    expect(result.yearlyResults[0]!.totalBalance).toBeCloseTo(expected, 0)
  })

  it('pre-tax (traditional) contributions reduce taxable income; FICA still applies to gross', () => {
    const salary = 100000
    const preTax = 10000
    const expectedSurplus =
      salary - preTax - ordinaryTax(salary - preTax, 'single') - 0.0765 * salary
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 40, maxAge: 45, retirementAge: 41, annualSalary: salary, salaryGrowthRate: 0 },
        accounts: [{
          id: 'trad', name: '401k', type: 'traditional',
          balance: 0,
          contributionAmount: 0.10, // 10% of salary, pre-tax
          contributionType: 'percent',
          contributionFrequency: 'monthly',
          contributionEndAge: 41,
          withdrawalStartAge: 60,
        }],
        annualExpenses: 0,
      }),
      ZERO_RATES,
    )
    // Year-1 portfolio = the traditional contribution + banked surplus.
    expect(result.yearlyResults[0]!.totalBalance).toBeCloseTo(preTax + expectedSurplus, 0)
  })

  it('married filing status uses the wider married brackets (bigger take-home)', () => {
    const base = {
      person: { ...defaultInputs().person, currentAge: 40, maxAge: 42, retirementAge: 41, annualSalary: 150000, salaryGrowthRate: 0 },
      accounts: [],
      annualExpenses: 0,
    }
    const single = runSingleProjection(
      inputs({ ...base, person: { ...base.person, filingStatus: 'single' as const } }),
      ZERO_RATES,
    )
    const married = runSingleProjection(
      inputs({ ...base, person: { ...base.person, filingStatus: 'married' as const } }),
      ZERO_RATES,
    )
    expect(married.yearlyResults[0]!.totalBalance).toBeGreaterThan(
      single.yearlyResults[0]!.totalBalance,
    )
  })
})

describe('runSingleProjection — surplus take-home is saved, not discarded', () => {
  it('banks unspent salary into the taxable account during working years', () => {
    // $100k salary, $30k expenses: take-home comfortably exceeds spending, and
    // the difference must accumulate rather than evaporate. Exact take-home
    // depends on the working-year tax model, so assert a generous band.
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 40, maxAge: 50, retirementAge: 45, annualSalary: 100000, salaryGrowthRate: 0 },
        accounts: [{
          id: 'tax', name: 'Brokerage', type: 'taxable',
          balance: 0, costBasis: 0,
          contributionAmount: 0,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 45,
          withdrawalStartAge: 45,
        }],
        annualExpenses: 30000,
      }),
      ZERO_RATES,
    )
    const yr1 = result.yearlyResults[0]!
    expect(yr1.totalBalance).toBeGreaterThan(30000)
    expect(yr1.totalBalance).toBeLessThan(60000)
    // The banked surplus is reported as savings in the cashflow series.
    expect(yr1.contributions).toBeCloseTo(yr1.totalBalance, 0)
    // Five working years accumulate ~5× the annual surplus.
    const yr5 = result.yearlyResults[4]!
    expect(yr5.totalBalance).toBeGreaterThan(yr1.totalBalance * 4.5)
  })

  it('creates a savings account lazily when no taxable account exists', () => {
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 40, maxAge: 46, retirementAge: 45, annualSalary: 100000, salaryGrowthRate: 0 },
        accounts: [],
        annualExpenses: 30000,
      }),
      ZERO_RATES,
    )
    expect(result.yearlyResults[0]!.totalBalance).toBeGreaterThan(30000)
  })
})

describe('runSingleProjection — person.retirementAge is the single retirement definition', () => {
  it('salary stops at retirementAge even when an account claims contributions until later', () => {
    // retirementAge 62, but the account says contributionEndAge 70. Salary must
    // stop at 62; the tiny portfolio then can't cover expenses → early depletion.
    // (The old proxy — salary until max(contributionEndAge) — would carry the
    // paycheck to 70 and deplete only around 71.)
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 75, retirementAge: 62, annualSalary: 200000 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 10000,
          contributionAmount: 0,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 70,
          withdrawalStartAge: 60,
        }],
        annualExpenses: 100000,
      }),
      ZERO_RATES,
    )
    expect(result.succeeded).toBe(false)
    expect(result.depleteAge).toBeDefined()
    expect(result.depleteAge!).toBeLessThanOrEqual(64)
  })

  it('contributions are capped at retirementAge (no contributions from a paycheck that stopped)', () => {
    // Flat $1,000/mo, account claims contributions until 70, but retirement is 62.
    // With zero growth and zero expenses the end balance isolates contributions:
    // only ages 60 and 61 contribute (2 × $12,000).
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 70, retirementAge: 62, annualSalary: 0 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 100000,
          contributionAmount: 1000,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 70,
          withdrawalStartAge: 60,
        }],
        annualExpenses: 0,
      }),
      ZERO_RATES,
    )
    expect(result.yearlyResults.at(-1)!.totalBalance).toBeCloseTo(100000 + 24000, -2)
  })

  it('a contributionEndAge earlier than retirementAge is still respected', () => {
    // Contributions stop at 62 while the salary runs to 65: end balance gains
    // only the two contributing years.
    const result = runSingleProjection(
      inputs({
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 70, retirementAge: 65, annualSalary: 0 },
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 100000,
          contributionAmount: 1000,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 62,
          withdrawalStartAge: 60,
        }],
        annualExpenses: 0,
      }),
      ZERO_RATES,
    )
    expect(result.yearlyResults.at(-1)!.totalBalance).toBeCloseTo(100000 + 24000, -2)
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
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 70, annualSalary: 0 },
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
        person: { ...defaultInputs().person, currentAge: 60, maxAge: 70, annualSalary: 0 },
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
    // RMD proceeds are ordinary income, taxed progressively (no other income, no
    // SS, zero inflation → single filer at priceLevel 1) — not at a flat rate.
    const tax = ordinaryTax(rmd, 'single')
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
    const net = rmd - ordinaryTax(rmd, 'single') // progressive ordinary tax on the RMD
    const yr = result.yearlyResults.at(-1)!
    // Net proceeds land in the user's existing brokerage, not a synthetic account.
    expect(yr.accountBalances['brok']).toBeCloseTo(100_000 + net, -1)
    expect(yr.accountBalances['trad']).toBeCloseTo(1_000_000 - rmd, -1)
    expect(yr.accountBalances['__rmd_reinvest']).toBeUndefined()
  })
})

describe('runSingleProjection — per-year rate schedule (P0 #1)', () => {
  const rothInputs = (overrides = {}) =>
    inputs({
      person: { ...defaultInputs().person, currentAge: 65, maxAge: 70, annualSalary: 0 },
      accounts: [{
        id: 'a', name: 'Roth', type: 'roth',
        balance: 100_000,
        contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 65, withdrawalStartAge: 65,
      }],
      annualExpenses: 0,
      socialSecurity: undefined,
      oneTimeExpenses: [],
      ...overrides,
    })

  it('applies a different rate each year from a per-year schedule', () => {
    // Year 0 grows 10%, year 1 flat — no withdrawals.
    const result = runSingleProjection(rothInputs({
      person: { ...defaultInputs().person, currentAge: 65, maxAge: 67, annualSalary: 0 },
    }), [
      { stockGrowth: 0.10, inflation: 0 },
      { stockGrowth: 0.0, inflation: 0 },
    ])
    const y0 = result.yearlyResults[0].totalBalance
    const y1 = result.yearlyResults[1].totalBalance
    const oneYearAt10 = 100_000 * Math.pow(1 + Math.pow(1.10, 1 / 12) - 1, 12)
    expect(y0).toBeCloseTo(oneYearAt10, -2) // ~110,000 after the 10% year
    expect(y1).toBeCloseTo(y0, -2) // flat year leaves it ~unchanged
  })

  it('models sequence-of-returns risk: order of the same returns changes outcomes', () => {
    // Identical multiset of annual returns, reversed. With withdrawals, a bad
    // early sequence permanently damages the portfolio vs. a good early sequence.
    const goodEarly = [0.5, 0.5, -0.4, -0.4, 0.0].map((g) => ({ stockGrowth: g, inflation: 0 }))
    const badEarly = [...goodEarly].reverse()
    // Modest withdrawal so neither path fully depletes (a zeroed portfolio would
    // erase the difference) — the gap then shows up in the ending balance.
    const withdraw = { annualExpenses: 10_000 }

    const good = runSingleProjection(rothInputs(withdraw), goodEarly)
    const bad = runSingleProjection(rothInputs(withdraw), badEarly)

    const goodEnd = good.yearlyResults.at(-1)!.totalBalance
    const badEnd = bad.yearlyResults.at(-1)!.totalBalance
    // Same average return, different order → different ending balance (the whole
    // point of restoring sequence risk), with the bad-early path worse off.
    expect(goodEnd).not.toBeCloseTo(badEnd, -2)
    expect(badEnd).toBeLessThan(goodEnd)
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
        // Exactly the progressive + FICA take-home: zero margin either way.
        annualExpenses: 100_000 - ordinaryTax(100_000, 'single') - 0.0765 * 100_000,
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
    // After-tax salary exactly covers expenses, so the taxable account is
    // untouched and the $10k match lands in the 401k.
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
        // Take-home with pre-tax 401k = 100k − 20k − tax(80k) − FICA(100k),
        // exactly covering expenses. If the 401k deferral were (wrongly) income-
        // taxed, take-home would fall short and the taxable account would be
        // tapped for the gap.
        annualExpenses: 100_000 - tradAnnual - ordinaryTax(80_000, 'single') - 0.0765 * 100_000,
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

describe('runSingleProjection — guardrails spending policy (#11)', () => {
  // Retiree at 65, single Roth $1M, $60k/yr flat target, no SS/salary/tax.
  const retiree = (policy: 'flat' | 'guardrails') =>
    inputs({
      spendingPolicy: policy,
      person: {
        ...defaultInputs().person,
        currentAge: 65, maxAge: 80, annualSalary: 0, marginalTaxRate: 0, retirementAge: 65,
      },
      accounts: [{
        id: 'a', name: 'Roth', type: 'roth', balance: 1_000_000,
        contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 65, withdrawalStartAge: 65,
      }],
      annualExpenses: 60_000,
      socialSecurity: undefined,
      oneTimeExpenses: [],
    } as Partial<SimulationInputs>)

  // A bad early sequence (deep crashes up front) spikes the withdrawal rate.
  const badSequence = [
    -0.25, -0.25, -0.2, 0.05, 0.05, 0.05, 0.05, 0.05,
    0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
  ].map((g) => ({ stockGrowth: g, inflation: 0 }))

  it('flat policy never adjusts spending', () => {
    const flat = runSingleProjection(retiree('flat'), badSequence)
    expect(flat.spendAdjustments).toEqual([])
  })

  it('guardrails cuts spending when the withdrawal rate spikes in a downturn', () => {
    const guard = runSingleProjection(retiree('guardrails'), badSequence)
    expect(guard.spendAdjustments.some((a) => a.kind === 'cut')).toBe(true)
  })

  it('guardrails preserves more capital than flat through a bad sequence', () => {
    const flat = runSingleProjection(retiree('flat'), badSequence)
    const guard = runSingleProjection(retiree('guardrails'), badSequence)
    const flatEnd = flat.yearlyResults.at(-1)!.totalBalance
    const guardEnd = guard.yearlyResults.at(-1)!.totalBalance
    // Trimming spending in the downturn leaves more in the portfolio.
    expect(guardEnd).toBeGreaterThan(flatEnd)
  })

  it('guardrails raises spending when markets are kind (low withdrawal rate)', () => {
    const goodSequence = new Array(15).fill({ stockGrowth: 0.18, inflation: 0 })
    const guard = runSingleProjection(retiree('guardrails'), goodSequence)
    expect(guard.spendAdjustments.some((a) => a.kind === 'raise')).toBe(true)
  })

  it('reports the lowest spending level reached (a "success" with deep cuts is visible)', () => {
    const guard = runSingleProjection(retiree('guardrails'), badSequence)
    // Each cut is −10%: with at least one cut the floor is ≤ 0.9, and it can
    // never sit below every cut applied back-to-back.
    const cuts = guard.spendAdjustments.filter((a) => a.kind === 'cut').length
    expect(cuts).toBeGreaterThan(0)
    expect(guard.minSpendMultiplier).toBeLessThanOrEqual(0.9)
    expect(guard.minSpendMultiplier).toBeGreaterThanOrEqual(0.9 ** cuts - 1e-9)
  })

  it('flat policy always reports a spending floor of 1', () => {
    const flat = runSingleProjection(retiree('flat'), badSequence)
    expect(flat.minSpendMultiplier).toBe(1)
  })
})
