import { SimAccount } from './account'
import { annualToMonthlyRate, inflate, rmdDivisor, rmdStartAge } from '../math'
import {
  ordinaryTax,
  taxableSocialSecurity,
  ltcgTaxOnGain,
  grossUpOrdinary,
  grossUpTaxableGain,
  STANDARD_DEDUCTION,
  FICA_RATE,
  EARLY_WITHDRAWAL_AGE,
  EARLY_WITHDRAWAL_PENALTY,
} from './tax'
import type { FilingStatus } from './tax'
import { sumEssentialExpenses } from './expenses'
import { WithdrawalStrategy } from '../schema'
import type { SimulationInputs } from '../schema'

/**
 * Per-year tax accounting carried through the withdrawal helpers. Amounts are in
 * **today's dollars**; `priceLevel` converts to/from nominal (nominal = real ×
 * priceLevel). `ordinaryReal` and `ltcgReal` accumulate income realized so far
 * this year so each successive withdrawal is taxed at its correct marginal
 * position (brackets fill, the standard deduction is consumed once, and LTCG
 * stacks on top of ordinary income).
 */
interface TaxContext {
  fs: FilingStatus
  priceLevel: number
  /** Age at the start of this year — gates the 10% early-distribution penalty. */
  age: number
  /** Gross ordinary income realized this year (incl. taxable SS), today's $. */
  ordinaryReal: number
  /** Realized long-term gains this year, today's $. */
  ltcgReal: number
}

/** The early-distribution penalty rate in force for traditional draws at `age`. */
function penaltyRate(tax: TaxContext): number {
  return tax.age < EARLY_WITHDRAWAL_AGE ? EARLY_WITHDRAWAL_PENALTY : 0
}

/** Total taxable income sitting *below* the next LTCG dollar (today's $). */
function incomeBelowGains(tax: TaxContext): number {
  return Math.max(0, tax.ordinaryReal - STANDARD_DEDUCTION[tax.fs]) + tax.ltcgReal
}

export interface SampledRates {
  /** Annual nominal stock growth for this run */
  stockGrowth: number
  /** Annual inflation for this run */
  inflation: number
  /**
   * Annual nominal bond growth, applied to the non-stock fraction of allocated
   * accounts. Optional for back-compat (legacy schedules, test fixtures): when
   * absent, the stock rate is used for everything — the original single-asset
   * behavior.
   */
  bondGrowth?: number
}

export interface YearEndState {
  age: number
  totalBalance: number
  accountBalances: Record<string, number>
  /** Total contributions + employer match credited this year (nominal $) */
  contributions: number
  /** Social Security income received this year (nominal $) */
  socialSecurity: number
  /** Gross withdrawals from accounts this year (nominal $) */
  withdrawals: number
}

/** A guardrails spending change in a given year. */
export interface SpendAdjustment {
  age: number
  kind: 'cut' | 'raise'
}

export interface ProjectionResult {
  yearlyResults: YearEndState[]
  succeeded: boolean
  /** Age at which portfolio hit zero (only set when succeeded = false) */
  depleteAge: number | undefined
  /** Guardrails spending changes across the run (empty for the flat policy). */
  spendAdjustments: SpendAdjustment[]
  /**
   * Lowest spending multiplier reached during the run (1 = the plan's full
   * spend). Always 1 under the flat policy. Makes a guardrails "success" that
   * survived only by cutting spending 30% visible instead of silent.
   */
  minSpendMultiplier: number
}

/** Guardrails: trim/raise spending by this fraction when the WR drifts past the band. */
const GUARDRAIL_STEP = 0.1
/** Guardrails: how far the withdrawal rate must drift from baseline to trigger (±20%). */
const GUARDRAIL_BAND = 0.2

/**
 * Run a single deterministic projection with pre-sampled growth/inflation rates.
 *
 * `rates` accepts two shapes:
 *  - **A single `SampledRates`** — one constant rate for the INITIAL segment. If
 *    `breakpointRates` is also provided, index k supplies the rates for the k-th
 *    entry in `inputs.breakpoints` (each takes effect from its `startAge` onward,
 *    superseding earlier segments). This is the deterministic known-answer shape
 *    used by unit tests.
 *  - **An array `SampledRates[]`** — a per-year schedule: year `y` (age
 *    `currentAge + y`) uses `rates[y]`, so returns and inflation vary year to year.
 *    This is what Monte Carlo passes, and it's what makes sequence-of-returns risk
 *    representable. The array form supersedes `breakpoints`/`breakpointRates`
 *    (the schedule already encodes segment-aware draws). A short array reuses its
 *    last entry defensively.
 *
 * For Monte Carlo: call this 1,000 times with different sampled schedules.
 */
export function runSingleProjection(
  inputs: SimulationInputs,
  rates: SampledRates | SampledRates[],
  breakpointRates?: SampledRates[],
): ProjectionResult {
  // Per-year schedule vs. single constant rate (with optional breakpoint segments).
  const yearlyRates = Array.isArray(rates) ? rates : undefined
  const constantRates = Array.isArray(rates) ? rates[rates.length - 1] : rates
  const {
    person,
    accounts,
    breakpoints,
    annualExpenses,
    baselineExpenses,
    socialSecurity,
    oneTimeExpenses,
    withdrawalStrategy,
    withdrawalOrder,
    spendingPolicy,
  } = inputs

  const filingStatus: FilingStatus = person.filingStatus ?? 'single'
  const guardrails = spendingPolicy === 'guardrails'
  // Guardrails state, persisted across years: the spend ratchets and stays at the
  // new level (inflation-adjusted) until the next trigger.
  let spendMultiplier = 1
  let minSpendMultiplier = 1
  let baseWithdrawalRate: number | undefined
  const spendAdjustments: SpendAdjustment[] = []
  // Cuts are bounded by the essential share of the baseline breakdown: a cut to
  // entertainment is survivable, a cut to rent and groceries is not, so the
  // multiplier never drops below essentials ÷ the plan's spend. Note the floor
  // is measured against `annualExpenses` (which solvers override per probe), so
  // a probe at or below the essential sum clamps to 1 and never cuts at all.
  const essentialSpend = sumEssentialExpenses(baselineExpenses ?? [])
  const spendFloor = annualExpenses > 0 ? Math.min(1, essentialSpend / annualExpenses) : 1

  // person.retirementAge is the single retirement definition: salary stops there,
  // and contributions can never outlive the paycheck that funds them — each
  // account's contributionEndAge is clamped to it. (An earlier contributionEndAge
  // is still respected: someone can stop funding one account before retiring.)
  const retirementAge = person.retirementAge
  const simAccounts = accounts.map(
    (a) =>
      new SimAccount(
        { ...a, contributionEndAge: Math.min(a.contributionEndAge, retirementAge) },
        0,
      ),
  )

  // After-tax cash sink: forced RMDs beyond spending need (spec §3.4) and unspent
  // working-years take-home are reinvested in a taxable account rather than
  // destroyed. Reuse an existing taxable account if present; otherwise create one
  // lazily on first use.
  let reinvestTarget: SimAccount | undefined = simAccounts.find((a) => a.type === 'taxable')
  const cashSink = (): SimAccount => {
    if (!reinvestTarget) {
      reinvestTarget = new SimAccount({
        id: '__rmd_reinvest',
        name: 'Reinvested cash',
        type: 'taxable',
        balance: 0,
        costBasis: 0,
        contributionAmount: 0,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: 0,
        withdrawalStartAge: 0,
      })
      simAccounts.push(reinvestTarget)
    }
    return reinvestTarget
  }

  const startAge = person.currentAge
  const maxAge = person.maxAge
  const years = maxAge - startAge

  // The year at which salary income stops. If the person is already past their
  // retirement age, no salary flows at all.
  const effectiveRetirementAge = retirementAge

  const yearlyResults: YearEndState[] = []
  let succeeded = true
  let depleteAge: number | undefined = undefined
  let depleted = false

  // Realized cumulative price level (∏ of each year's drawn inflation). All
  // present-dollar flows (expenses, Social Security, one-time costs) are converted
  // to nominal by THIS factor, not by a single year's rate raised to y — the two
  // only agree when inflation is constant. `priceLevel` is the level accrued over
  // the years BEFORE the current one, so year 0 spends today's dollars unscaled.
  let cumInflation = 1

  for (let y = 0; y < years; y++) {
    const yearStartAge = startAge + y
    const yearEndAge = startAge + y + 1

    // Determine active rates for this year.
    let growthRate: number
    let inflationRate: number
    let bondRate: number
    if (yearlyRates) {
      // Per-year schedule: year y uses rates[y] (reuse the last entry if short).
      const r = yearlyRates[Math.min(y, yearlyRates.length - 1)]
      growthRate = r.stockGrowth
      inflationRate = r.inflation
      bondRate = r.bondGrowth ?? r.stockGrowth
    } else {
      // Single constant rate, optionally superseded by breakpoint segments. Each
      // breakpoint that has already started wins; the latest applicable one
      // applies. Without breakpointRates the initial rates apply throughout.
      growthRate = constantRates.stockGrowth
      inflationRate = constantRates.inflation
      bondRate = constantRates.bondGrowth ?? constantRates.stockGrowth
      for (let k = 0; k < breakpoints.length; k++) {
        if (yearStartAge >= breakpoints[k].startAge) {
          const r = breakpointRates?.[k]
          if (r !== undefined) {
            growthRate = r.stockGrowth
            inflationRate = r.inflation
            bondRate = r.bondGrowth ?? r.stockGrowth
          }
        }
      }
    }

    const monthlyStockRate = annualToMonthlyRate(growthRate)
    const monthlyBondRate = annualToMonthlyRate(bondRate)
    // Per-account blended growth: stockAllocation in stocks, remainder in bonds.
    const monthlyRateFor = (alloc: number) =>
      alloc * monthlyStockRate + (1 - alloc) * monthlyBondRate
    const yearsFromStart = y

    // Price level applied to this year's flows = inflation accrued over prior
    // years. Advance the running product immediately so it's updated on every
    // path (including depletion years), keeping the level monotonic.
    const priceLevel = cumInflation
    cumInflation *= 1 + inflationRate

    // Salary for this year (inflation-adjusted using salary growth rate)
    const annualSalary = inflate(
      person.annualSalary,
      0,
      yearsFromStart,
      person.salaryGrowthRate,
    )

    // Simulate 12 months of growth + contributions
    for (let m = 0; m < 12; m++) {
      for (const acc of simAccounts) {
        acc.applyMonthlyGrowth(monthlyRateFor(acc.stockAllocation))
        acc.contribute(yearStartAge, annualSalary, priceLevel)
      }
    }

    let contributionsThisYear = depleted
      ? 0
      : simAccounts.reduce((s, a) => s + a.annualContribution(yearStartAge, annualSalary, priceLevel), 0)
    let socialSecurityThisYear = 0
    let withdrawalsThisYear = 0

    // Annual withdrawal phase
    if (!depleted) {
      const inflatedExpenses = annualExpenses * priceLevel

      // Per-year tax accounting (today's dollars; brackets track inflation via the
      // realized price level, so a constant real spend stays in a constant real
      // bracket). Seeded below with the taxable portion of Social Security.
      const tax: TaxContext = {
        fs: filingStatus,
        priceLevel,
        age: yearStartAge,
        ordinaryReal: 0,
        ltcgReal: 0,
      }

      // Social Security income. Entered in present dollars, so it holds today's
      // purchasing power: convert by the realized price level from the start, not
      // from claim age.
      let ssIncome = 0
      if (socialSecurity && yearEndAge > socialSecurity.claimAge) {
        ssIncome = socialSecurity.annualAmountPresentDollars * priceLevel
      }
      socialSecurityThisYear = ssIncome

      // One-time expenses due this year (present dollars → nominal by price level)
      let oneTimeTotal = 0
      for (const ote of oneTimeExpenses) {
        // Lump-sum at event age
        if (ote.age === yearStartAge) {
          oneTimeTotal += ote.amountPresentDollars * priceLevel
        }
        // Recurring follow-on: active every year from event age onward
        if (ote.recurringFollowOnAmount !== undefined && yearStartAge >= ote.age) {
          oneTimeTotal += ote.recurringFollowOnAmount * priceLevel
        }
      }

      // Disposable income from salary during working years (until retirementAge).
      //
      // Cash flow of a paycheck:
      //   - Traditional employee contributions are PRE-TAX — they leave the
      //     paycheck before income tax and reduce taxable income.
      //   - Roth / taxable employee contributions are AFTER-TAX — paid from
      //     take-home pay.
      //   - The employer match is NOT paid from salary at all, so it never
      //     reduces take-home.
      //   - FICA applies to GROSS salary (401(k) deferrals are FICA-taxable).
      //
      // Income tax uses the same progressive federal schedule as the withdrawal
      // phase (brackets are in today's dollars; the salary is deflated by the
      // realized price level, matching the IRS's annual bracket indexing), plus
      // flat FICA. State tax is out of scope, as in the withdrawal phase.
      let disposableIncome = 0
      if (yearStartAge < effectiveRetirementAge && annualSalary > 0) {
        let preTaxContrib = 0 // traditional employee contributions
        let afterTaxContrib = 0 // roth + taxable employee contributions
        for (const acc of simAccounts) {
          const employee = acc.annualEmployeeContribution(yearStartAge, annualSalary, priceLevel)
          if (acc.type === 'traditional') preTaxContrib += employee
          else afterTaxContrib += employee
        }
        const salaryReal = annualSalary / priceLevel
        const taxableReal = Math.max(0, (annualSalary - preTaxContrib) / priceLevel)
        const incomeTaxReal = ordinaryTax(taxableReal, filingStatus)
        const ficaReal = FICA_RATE * salaryReal
        const afterTaxSalary = (taxableReal - incomeTaxReal - ficaReal) * priceLevel
        disposableIncome = Math.max(0, afterTaxSalary - afterTaxContrib)
      }

      // Partial Social Security taxation. Estimate the year's other taxable income
      // (the portfolio draw needed after SS + salary) to size provisional income,
      // then seed the year's ordinary-income stack with the taxable SS portion so
      // later traditional withdrawals stack on top of it. The cash value of SS is
      // reduced by the tax owed on its taxable portion (the rest of that ordinary
      // tax — on traditional dollars above SS — is covered by grossing up those
      // withdrawals). Both `tax.ordinaryReal` and `ssNet` are in nominal terms via
      // `priceLevel`.
      let ssNet = ssIncome
      if (ssIncome > 0) {
        const ssReal = ssIncome / priceLevel
        const portfolioNeedEst = Math.max(0, inflatedExpenses + oneTimeTotal - ssIncome - disposableIncome)
        const taxableSSReal = taxableSocialSecurity(
          ssReal,
          portfolioNeedEst / priceLevel,
          filingStatus,
          priceLevel,
        )
        tax.ordinaryReal = taxableSSReal
        ssNet = ssIncome - ordinaryTax(taxableSSReal, filingStatus) * priceLevel
      }

      // Per-account balance before any withdrawals this year — used to size RMDs
      // (a floor based on the start-of-year balance), measure spending, and judge
      // the guardrails withdrawal rate.
      const balBeforeWithdrawal: Record<string, number> = {}
      for (const acc of simAccounts) balBeforeWithdrawal[acc.id] = acc.getBalance()
      const balBeforeExpense = simAccounts.reduce((s, a) => s + a.getBalance(), 0)

      // Guardrails: flex the recurring spend with the portfolio. We compare the
      // current recurring withdrawal rate (net of SS) to the rate locked in at the
      // first retirement draw; drift past ±band trims/raises spending one step.
      // Only engages in retirement (when actually drawing from the portfolio).
      let spendThisYear = inflatedExpenses
      if (guardrails && yearStartAge >= effectiveRetirementAge && balBeforeExpense > 0) {
        const recurringNet = inflatedExpenses * spendMultiplier - ssNet
        if (recurringNet > 0) {
          const wr = recurringNet / balBeforeExpense
          if (baseWithdrawalRate === undefined) {
            baseWithdrawalRate = wr
          } else if (wr > baseWithdrawalRate * (1 + GUARDRAIL_BAND)) {
            // Trim one step, but never below the essential spending floor — and
            // don't record a phantom cut once the floor is already binding.
            const trimmed = Math.max(spendMultiplier * (1 - GUARDRAIL_STEP), spendFloor)
            if (trimmed < spendMultiplier) {
              spendMultiplier = trimmed
              spendAdjustments.push({ age: yearEndAge, kind: 'cut' })
            }
          } else if (wr < baseWithdrawalRate * (1 - GUARDRAIL_BAND)) {
            spendMultiplier *= 1 + GUARDRAIL_STEP
            spendAdjustments.push({ age: yearEndAge, kind: 'raise' })
          }
          minSpendMultiplier = Math.min(minSpendMultiplier, spendMultiplier)
        }
        spendThisYear = inflatedExpenses * spendMultiplier
      }

      const netNeed = Math.max(0, spendThisYear + oneTimeTotal - ssNet - disposableIncome)

      // Unspent income is savings: take-home (plus SS) above this year's spending
      // is banked in taxable rather than discarded. Without this, an under-spender
      // accumulates nothing beyond their configured contributions.
      const surplus = Math.max(0, ssNet + disposableIncome - spendThisYear - oneTimeTotal)
      if (surplus > 0) {
        cashSink().deposit(surplus)
        contributionsThisYear += surplus
      }

      let shortfall = 0
      if (netNeed > 0) {
        shortfall = makeWithdrawals(
          simAccounts,
          netNeed,
          yearStartAge,
          withdrawalStrategy,
          withdrawalOrder ?? [],
          tax,
          false,
        )

        // One-time expenses can't be deferred. If accounts that would normally
        // cover the need are still locked (withdrawalStartAge > currentAge),
        // re-run the withdrawal pass with the lockout lifted — modeling the
        // real-world reality that you'd tap a locked account (early-withdrawal
        // penalties aside) rather than silently absorb a lump-sum cost.
        if (shortfall > 0.01 && oneTimeTotal > 0) {
          const cap = Math.min(shortfall, oneTimeTotal)
          shortfall = (shortfall - cap) + makeWithdrawals(
            simAccounts,
            cap,
            yearStartAge,
            withdrawalStrategy,
            withdrawalOrder ?? [],
            tax,
            true,
          )
        }
      }

      // Spending withdrawals = drop in portfolio from funding expenses (pre-RMD).
      const balAfterExpense = simAccounts.reduce((s, a) => s + a.getBalance(), 0)
      withdrawalsThisYear = Math.max(0, balBeforeExpense - balAfterExpense)

      // Use a small threshold to avoid false positives from floating-point
      // rounding in the gross-up round-trip (e.g. net/rate*rate ≠ net exactly).
      //
      // Real depletion requires that there's an actual unmet need AND no
      // available portfolio to cover it. We treat a shortfall as depletion
      // only when the total portfolio is below the unmet need — otherwise
      // it's a temporary lockout (e.g. money exists but withdrawalStartAge
      // hasn't been reached) and the simulation continues. RMDs are excluded
      // from this judgment — a forced distribution never causes failure.
      if (shortfall > 0.01 && balAfterExpense < shortfall - 0.01) {
        depleted = true
        depleteAge = yearEndAge
        succeeded = false
        contributionsThisYear = 0
        socialSecurityThisYear = 0
        // Spec §3.3: portfolio remains at zero for the remainder of the projection.
        for (const acc of simAccounts) {
          acc.zero()
        }
      }

      // RMDs (spec §3.4): from the cohort's start age (73, or 75 for those born
      // 1960+ under SECURE 2.0), each traditional account must distribute at
      // least balance/divisor. Withdrawals already taken this year count toward the
      // RMD floor; only the remaining shortfall is forced out. Forced proceeds are
      // ordinary income — taxed at the progressive marginal position above whatever
      // was already realized this year — and the after-tax remainder is reinvested
      // in taxable, never destroyed. Runs regardless of spending need.
      if (!depleted && yearStartAge >= rmdStartAge(person.currentAge)) {
        const divisor = rmdDivisor(yearStartAge)
        if (divisor !== undefined) {
          // Snapshot traditional accounts so lazily creating the sink (which pushes
          // onto simAccounts) doesn't perturb iteration.
          const tradAccounts = simAccounts.filter((a) => a.type === 'traditional')
          for (const acc of tradAccounts) {
            const base = balBeforeWithdrawal[acc.id] ?? acc.getBalance()
            const required = base / divisor
            const alreadyWithdrawn = base - acc.getBalance()
            const force = Math.max(0, required - alreadyWithdrawn)
            if (force <= 0 || acc.getBalance() <= 0) continue
            const gross = acc.withdraw(force, yearStartAge)
            if (gross <= 0) continue
            const grossReal = gross / priceLevel
            const incTaxReal =
              ordinaryTax(tax.ordinaryReal + grossReal, filingStatus) -
              ordinaryTax(tax.ordinaryReal, filingStatus)
            tax.ordinaryReal += grossReal
            const net = (grossReal - incTaxReal) * priceLevel
            cashSink().deposit(net)
          }
        }
      }
    }

    // Per spec §3.3: once depleted, balances stay at zero.
    const totalBalance = depleted
      ? 0
      : simAccounts.reduce((s, a) => s + a.getBalance(), 0)
    const accountBalances: Record<string, number> = {}
    for (const acc of simAccounts) {
      accountBalances[acc.id] = depleted ? 0 : acc.getBalance()
    }

    yearlyResults.push({
      age: yearEndAge,
      totalBalance,
      accountBalances,
      contributions: contributionsThisYear,
      socialSecurity: socialSecurityThisYear,
      withdrawals: withdrawalsThisYear,
    })
  }

  return { yearlyResults, succeeded, depleteAge, spendAdjustments, minSpendMultiplier }
}

// ─── Withdrawal orchestration ─────────────────────────────────────────────────

/**
 * Withdraw netNeed from accounts according to strategy.
 * Returns remaining shortfall (0 if fully met).
 */
function makeWithdrawals(
  accounts: SimAccount[],
  netNeed: number,
  currentAge: number,
  strategy: WithdrawalStrategy,
  userOrder: string[],
  tax: TaxContext,
  forceUnlock: boolean,
): number {
  let remaining = netNeed
  const ordered = orderAccounts(accounts, strategy, userOrder, currentAge, forceUnlock)

  if (strategy === WithdrawalStrategy.Proportional) {
    return makeProportionalWithdrawals(accounts, netNeed, currentAge, tax, forceUnlock)
  }

  for (const acc of ordered) {
    if (remaining <= 0) break
    if (acc.getBalance() <= 0) continue

    const balBefore = acc.getBalance()
    const basisBefore = acc.getCostBasis()
    const gross = grossNeeded(acc, remaining, tax)
    // forceUnlock: bypass SimAccount's withdrawalStartAge check by passing
    // undefined (per its documented "omit to skip check" behavior).
    const actualGross = acc.withdraw(gross, forceUnlock ? undefined : currentAge)
    if (actualGross <= 0) continue

    const netDelivered = netFromGross(acc, actualGross, balBefore, basisBefore, tax)
    remaining = Math.max(0, remaining - netDelivered)
  }

  return remaining
}

function makeProportionalWithdrawals(
  accounts: SimAccount[],
  netNeed: number,
  currentAge: number,
  tax: TaxContext,
  forceUnlock: boolean,
): number {
  const eligible = accounts.filter(
    (a) => a.getBalance() > 0 && (forceUnlock || a.withdrawalStartAge <= currentAge),
  )
  if (eligible.length === 0) return netNeed

  const totalBalance = eligible.reduce((s, a) => s + a.getBalance(), 0)
  if (totalBalance <= 0) return netNeed

  let remaining = netNeed

  for (const acc of eligible) {
    const share = acc.getBalance() / totalBalance
    const netShare = netNeed * share
    const balBefore = acc.getBalance()
    const basisBefore = acc.getCostBasis()
    const gross = grossNeeded(acc, netShare, tax)
    const actualGross = acc.withdraw(gross, forceUnlock ? undefined : currentAge)
    if (actualGross <= 0) continue
    const net = netFromGross(acc, actualGross, balBefore, basisBefore, tax)
    remaining = Math.max(0, remaining - net)
  }

  return remaining
}

/**
 * Gross withdrawal to request so the account nets `netNeeded` (nominal), given the
 * year's tax state. Reads `tax` but does not mutate it — the realized income is
 * committed in `netFromGross` against the actual (possibly balance-capped) gross.
 */
function grossNeeded(acc: SimAccount, netNeeded: number, tax: TaxContext): number {
  // Roth: modeled penalty- and tax-free (basis-first simplification — real Roth
  // earnings drawn before 59½ would owe tax + penalty).
  if (acc.type === 'roth') return netNeeded
  const netReal = netNeeded / tax.priceLevel
  if (acc.type === 'traditional') {
    return grossUpOrdinary(netReal, tax.ordinaryReal, tax.fs, penaltyRate(tax)) * tax.priceLevel
  }
  const bal = acc.getBalance()
  const gainFrac = bal > 0 ? Math.max(0, (bal - acc.getCostBasis()) / bal) : 0
  return grossUpTaxableGain(netReal, gainFrac, incomeBelowGains(tax), tax.fs) * tax.priceLevel
}

/**
 * Net delivered by an actual gross withdrawal, committing the realized income into
 * the year's tax state (ordinary for traditional/RMD, LTCG for taxable gains).
 */
function netFromGross(
  acc: SimAccount,
  gross: number,
  balBefore: number,
  basisBefore: number,
  tax: TaxContext,
): number {
  if (acc.type === 'roth') return gross
  const grossReal = gross / tax.priceLevel
  if (acc.type === 'traditional') {
    const incTax =
      ordinaryTax(tax.ordinaryReal + grossReal, tax.fs) - ordinaryTax(tax.ordinaryReal, tax.fs)
    const penalty = penaltyRate(tax) * grossReal
    tax.ordinaryReal += grossReal
    return (grossReal - incTax - penalty) * tax.priceLevel
  }
  // taxable: gain fraction derived from the pre-withdrawal balance and basis.
  // (Reconstructing from post-withdrawal state breaks when the account is fully
  // drained — basis and balance both go to 0, yielding 0/0 = NaN.)
  const gainFrac = balBefore > 0 ? Math.max(0, (balBefore - basisBefore) / balBefore) : 0
  const gainReal = grossReal * gainFrac
  const ltcgTax = ltcgTaxOnGain(gainReal, incomeBelowGains(tax), tax.fs)
  tax.ltcgReal += gainReal
  return (grossReal - ltcgTax) * tax.priceLevel
}

function orderAccounts(
  accounts: SimAccount[],
  strategy: WithdrawalStrategy,
  userOrder: string[],
  currentAge: number,
  forceUnlock: boolean,
): SimAccount[] {
  const eligible = accounts.filter((a) => forceUnlock || a.withdrawalStartAge <= currentAge)

  if (strategy === WithdrawalStrategy.TaxOptimal) {
    const order = ['taxable', 'traditional', 'roth'] as const
    return order.flatMap((t) => eligible.filter((a) => a.type === t))
  }

  if (strategy === WithdrawalStrategy.UserDefined) {
    const mapped = new Map(eligible.map((a) => [a.id, a]))
    const ordered = userOrder.flatMap((id) => (mapped.get(id) ? [mapped.get(id)!] : []))
    const inList = new Set(userOrder)
    const rest = eligible.filter((a) => !inList.has(a.id))
    return [...ordered, ...rest]
  }

  return eligible
}
