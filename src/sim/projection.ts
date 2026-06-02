import { SimAccount } from './account'
import {
  annualToMonthlyRate,
  inflate,
  rmdDivisor,
  taxableWithdrawalGrossUp,
  traditionalWithdrawalGrossUp,
} from '../math'
import { WithdrawalStrategy } from '../schema'
import type { SimulationInputs } from '../schema'

export interface SampledRates {
  /** Annual nominal stock growth for this run */
  stockGrowth: number
  /** Annual inflation for this run */
  inflation: number
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

export interface ProjectionResult {
  yearlyResults: YearEndState[]
  succeeded: boolean
  /** Age at which portfolio hit zero (only set when succeeded = false) */
  depleteAge: number | undefined
}

/**
 * Run a single deterministic projection with pre-sampled growth/inflation rates.
 * The `rates` object holds the rates for the INITIAL segment.
 *
 * If `breakpointRates` is provided, index k supplies the rates for the k-th
 * entry in `inputs.breakpoints` (each one takes effect from `startAge` onward,
 * superseding earlier segments). When omitted, the initial `rates` apply for
 * the entire projection — preserving the pre-segment-aware call shape.
 *
 * For Monte Carlo: call this 1,000 times with different sampled rates.
 */
export function runSingleProjection(
  inputs: SimulationInputs,
  rates: SampledRates,
  breakpointRates?: SampledRates[],
): ProjectionResult {
  const {
    person,
    accounts,
    breakpoints,
    annualExpenses,
    socialSecurity,
    oneTimeExpenses,
    withdrawalStrategy,
    withdrawalOrder,
  } = inputs

  const simAccounts = accounts.map((a) => new SimAccount(a, 0))

  // RMD reinvestment sink: forced RMDs beyond spending need are reinvested as
  // after-tax cash in a taxable account (spec §3.4) rather than destroyed. Reuse an
  // existing taxable account if present; otherwise create one lazily on first use.
  let reinvestTarget: SimAccount | undefined = simAccounts.find((a) => a.type === 'taxable')
  const rmdSink = (): SimAccount => {
    if (!reinvestTarget) {
      reinvestTarget = new SimAccount({
        id: '__rmd_reinvest',
        name: 'RMD reinvestment',
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

  // "Effective retirement age" — the year at which salary income stops.
  // Proxy: the latest contributionEndAge across all accounts. If no accounts,
  // assume the person retires at the start of the simulation (no salary).
  const effectiveRetirementAge = simAccounts.length > 0
    ? Math.max(...simAccounts.map((a) => a.contributionEndAge))
    : startAge

  const yearlyResults: YearEndState[] = []
  let succeeded = true
  let depleteAge: number | undefined = undefined
  let depleted = false

  for (let y = 0; y < years; y++) {
    const yearStartAge = startAge + y
    const yearEndAge = startAge + y + 1

    // Determine active rates for this year. Each breakpoint that has already
    // started supersedes earlier segments; the latest applicable wins. If
    // breakpointRates wasn't provided, the initial rates apply throughout
    // (back-compat with single-segment callers).
    let growthRate = rates.stockGrowth
    let inflationRate = rates.inflation
    for (let k = 0; k < breakpoints.length; k++) {
      if (yearStartAge >= breakpoints[k].startAge) {
        const r = breakpointRates?.[k]
        if (r !== undefined) {
          growthRate = r.stockGrowth
          inflationRate = r.inflation
        }
      }
    }

    const monthlyGrowthRate = annualToMonthlyRate(growthRate)
    const yearsFromStart = y

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
        acc.applyMonthlyGrowth(monthlyGrowthRate)
        acc.contribute(yearStartAge, annualSalary)
      }
    }

    let contributionsThisYear = depleted
      ? 0
      : simAccounts.reduce((s, a) => s + a.annualContribution(yearStartAge, annualSalary), 0)
    let socialSecurityThisYear = 0
    let withdrawalsThisYear = 0

    // Annual withdrawal phase
    if (!depleted) {
      const inflatedExpenses = inflate(annualExpenses, 0, yearsFromStart, inflationRate)

      // Social Security income (treated as fully tax-free per spec)
      let ssIncome = 0
      if (socialSecurity && yearEndAge > socialSecurity.claimAge) {
        const yearsFromClaim = yearEndAge - socialSecurity.claimAge
        ssIncome = inflate(
          socialSecurity.annualAmountPresentDollars,
          0,
          yearsFromClaim,
          inflationRate,
        )
      }
      socialSecurityThisYear = ssIncome

      // One-time expenses due this year
      let oneTimeTotal = 0
      for (const ote of oneTimeExpenses) {
        // Lump-sum at event age
        if (ote.age === yearStartAge) {
          const yearsToEvent = yearStartAge - startAge
          oneTimeTotal += inflate(ote.amountPresentDollars, 0, yearsToEvent, inflationRate)
        }
        // Recurring follow-on: active every year from event age onward
        if (ote.recurringFollowOnAmount !== undefined && yearStartAge >= ote.age) {
          const yearsFromEvent = yearStartAge - ote.age
          oneTimeTotal += inflate(ote.recurringFollowOnAmount, 0, yearsFromEvent, inflationRate)
        }
      }

      // Disposable income from salary during working years.
      // The user's salary covers expenses while they're still employed
      // (proxy: until the latest contributionEndAge across all accounts).
      //
      // Cash flow of a paycheck:
      //   - Traditional employee contributions are PRE-TAX — they leave the
      //     paycheck before income tax and reduce taxable income.
      //   - Roth / taxable employee contributions are AFTER-TAX — paid from
      //     take-home pay.
      //   - The employer match is NOT paid from salary at all, so it never
      //     reduces take-home.
      //
      //   take-home = (salary − preTaxContrib) × (1 − marginalRate) − afterTaxContrib
      let disposableIncome = 0
      if (yearStartAge < effectiveRetirementAge) {
        let preTaxContrib = 0 // traditional employee contributions
        let afterTaxContrib = 0 // roth + taxable employee contributions
        for (const acc of simAccounts) {
          const employee = acc.annualEmployeeContribution(yearStartAge, annualSalary)
          if (acc.type === 'traditional') preTaxContrib += employee
          else afterTaxContrib += employee
        }
        const taxableSalary = Math.max(0, annualSalary - preTaxContrib)
        const afterTaxSalary = taxableSalary * (1 - person.marginalTaxRate)
        disposableIncome = Math.max(0, afterTaxSalary - afterTaxContrib)
      }

      const netNeed = Math.max(0, inflatedExpenses + oneTimeTotal - ssIncome - disposableIncome)

      // Per-account balance before any withdrawals this year — used both to size
      // RMDs (a floor based on the start-of-year balance) and to measure spending.
      const balBeforeWithdrawal: Record<string, number> = {}
      for (const acc of simAccounts) balBeforeWithdrawal[acc.id] = acc.getBalance()
      const balBeforeExpense = simAccounts.reduce((s, a) => s + a.getBalance(), 0)

      let shortfall = 0
      if (netNeed > 0) {
        shortfall = makeWithdrawals(
          simAccounts,
          netNeed,
          yearStartAge,
          withdrawalStrategy,
          withdrawalOrder ?? [],
          person.marginalTaxRate,
          person.ltcgRate,
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
            person.marginalTaxRate,
            person.ltcgRate,
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

      // RMDs (spec §3.4): at age 73+, each traditional account must distribute at
      // least balance/divisor. Withdrawals already taken this year count toward the
      // RMD floor; only the remaining shortfall is forced out. Proceeds beyond
      // spending need are taxed at the marginal rate and the after-tax remainder is
      // reinvested in taxable — never destroyed. Runs regardless of spending need.
      if (!depleted) {
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
            const net = gross * (1 - person.marginalTaxRate)
            rmdSink().deposit(net)
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

  return { yearlyResults, succeeded, depleteAge }
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
  marginalRate: number,
  ltcgRate: number,
  forceUnlock: boolean,
): number {
  let remaining = netNeed
  const ordered = orderAccounts(accounts, strategy, userOrder, currentAge, forceUnlock)

  if (strategy === WithdrawalStrategy.Proportional) {
    return makeProportionalWithdrawals(accounts, netNeed, currentAge, marginalRate, ltcgRate, forceUnlock)
  }

  for (const acc of ordered) {
    if (remaining <= 0) break
    if (acc.getBalance() <= 0) continue

    const balBefore = acc.getBalance()
    const basisBefore = acc.getCostBasis()
    const gross = grossNeeded(acc, remaining, marginalRate, ltcgRate)
    // forceUnlock: bypass SimAccount's withdrawalStartAge check by passing
    // undefined (per its documented "omit to skip check" behavior).
    const actualGross = acc.withdraw(gross, forceUnlock ? undefined : currentAge)
    if (actualGross <= 0) continue

    const netDelivered = netFromGross(acc, actualGross, balBefore, basisBefore, marginalRate, ltcgRate)
    remaining = Math.max(0, remaining - netDelivered)
  }

  return remaining
}

function makeProportionalWithdrawals(
  accounts: SimAccount[],
  netNeed: number,
  currentAge: number,
  marginalRate: number,
  ltcgRate: number,
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
    const gross = grossNeeded(acc, netShare, marginalRate, ltcgRate)
    const actualGross = acc.withdraw(gross, forceUnlock ? undefined : currentAge)
    if (actualGross <= 0) continue
    const net = netFromGross(acc, actualGross, balBefore, basisBefore, marginalRate, ltcgRate)
    remaining = Math.max(0, remaining - net)
  }

  return remaining
}

function grossNeeded(
  acc: SimAccount,
  netNeeded: number,
  marginalRate: number,
  ltcgRate: number,
): number {
  if (acc.type === 'roth') return netNeeded
  if (acc.type === 'traditional') return traditionalWithdrawalGrossUp(netNeeded, marginalRate)
  return taxableWithdrawalGrossUp(netNeeded, acc.getBalance(), acc.getCostBasis(), ltcgRate)
}

function netFromGross(
  acc: SimAccount,
  gross: number,
  balBefore: number,
  basisBefore: number,
  marginalRate: number,
  ltcgRate: number,
): number {
  if (acc.type === 'roth') return gross
  if (acc.type === 'traditional') return gross * (1 - marginalRate)
  // taxable: gain fraction derived from the pre-withdrawal balance and basis.
  // (Reconstructing from post-withdrawal state breaks when the account is fully
  // drained — basis and balance both go to 0, yielding 0/0 = NaN.)
  const gainFrac = balBefore > 0 ? Math.max(0, (balBefore - basisBefore) / balBefore) : 0
  return gross - gross * gainFrac * ltcgRate
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
