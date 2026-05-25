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
 * For Monte Carlo: call this 1,000 times with different sampled rates.
 */
export function runSingleProjection(
  inputs: SimulationInputs,
  rates: SampledRates,
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

  const startAge = person.currentAge
  const maxAge = person.maxAge
  const years = maxAge - startAge

  const yearlyResults: YearEndState[] = []
  let succeeded = true
  let depleteAge: number | undefined = undefined
  let depleted = false

  for (let y = 0; y < years; y++) {
    const yearStartAge = startAge + y
    const yearEndAge = startAge + y + 1

    // Determine active rates for this year based on breakpoints
    let growthRate = rates.stockGrowth
    let inflationRate = rates.inflation
    for (const bp of breakpoints) {
      if (yearStartAge >= bp.startAge) {
        // In a full MC run these would be per-segment samples. Here we use the
        // provided rates as a proxy for the segment (MC overrides this via
        // per-segment sampling in runMonteCarlo).
        growthRate = rates.stockGrowth
        inflationRate = rates.inflation
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

      const netNeed = Math.max(0, inflatedExpenses + oneTimeTotal - ssIncome)

      if (netNeed > 0) {
        const shortfall = makeWithdrawals(
          simAccounts,
          netNeed,
          yearStartAge,
          withdrawalStrategy,
          withdrawalOrder ?? [],
          person.marginalTaxRate,
          person.ltcgRate,
        )

        // RMDs: forced withdrawal from traditional accounts at age 73+
        const divisor = rmdDivisor(yearStartAge)
        if (divisor !== undefined) {
          for (const acc of simAccounts) {
            if (acc.type === 'traditional' && acc.getBalance() > 0) {
              const rmd = acc.getBalance() / divisor
              // If strategy already withdrew enough, no additional action needed.
              // If not, force the shortfall out of traditional (added to taxable bucket).
              // Per spec: conservative approach — just withdraw the RMD minimum.
              acc.withdraw(rmd, yearStartAge)
            }
          }
        }

        // Use a small threshold to avoid false positives from floating-point
        // rounding in the gross-up round-trip (e.g. net/rate*rate ≠ net exactly).
        if (shortfall > 0.01) {
          depleted = true
          depleteAge = yearEndAge
          succeeded = false
        }
      }
    }

    const totalBalance = simAccounts.reduce((s, a) => s + a.getBalance(), 0)
    const accountBalances: Record<string, number> = {}
    for (const acc of simAccounts) {
      accountBalances[acc.id] = acc.getBalance()
    }

    yearlyResults.push({ age: yearEndAge, totalBalance, accountBalances })
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
): number {
  let remaining = netNeed
  const ordered = orderAccounts(accounts, strategy, userOrder, currentAge)

  if (strategy === WithdrawalStrategy.Proportional) {
    return makeProportionalWithdrawals(accounts, netNeed, currentAge, marginalRate, ltcgRate)
  }

  for (const acc of ordered) {
    if (remaining <= 0) break
    if (acc.getBalance() <= 0) continue

    const gross = grossNeeded(acc, remaining, marginalRate, ltcgRate)
    const actualGross = acc.withdraw(gross, currentAge)
    if (actualGross <= 0) continue

    const netDelivered = netFromGross(acc, actualGross, marginalRate, ltcgRate)
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
): number {
  const eligible = accounts.filter(
    (a) => a.getBalance() > 0 && a.withdrawalStartAge <= currentAge,
  )
  if (eligible.length === 0) return netNeed

  const totalBalance = eligible.reduce((s, a) => s + a.getBalance(), 0)
  if (totalBalance <= 0) return netNeed

  let remaining = netNeed

  for (const acc of eligible) {
    const share = acc.getBalance() / totalBalance
    const netShare = netNeed * share
    const gross = grossNeeded(acc, netShare, marginalRate, ltcgRate)
    const actualGross = acc.withdraw(gross, currentAge)
    if (actualGross <= 0) continue
    const net = netFromGross(acc, actualGross, marginalRate, ltcgRate)
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
  marginalRate: number,
  ltcgRate: number,
): number {
  if (acc.type === 'roth') return gross
  if (acc.type === 'traditional') return gross * (1 - marginalRate)
  // taxable: gain fraction based on current balance (after withdrawal was taken)
  const balAfter = acc.getBalance()
  const balBefore = balAfter + gross
  const basisBefore = acc.getCostBasis() + (gross * (balBefore > 0 ? acc.getCostBasis() / balAfter : 0))
  const gainFrac = balBefore > 0 ? Math.max(0, (balBefore - basisBefore) / balBefore) : 0
  return gross - gross * gainFrac * ltcgRate
}

function orderAccounts(
  accounts: SimAccount[],
  strategy: WithdrawalStrategy,
  userOrder: string[],
  currentAge: number,
): SimAccount[] {
  const eligible = accounts.filter((a) => a.withdrawalStartAge <= currentAge)

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
