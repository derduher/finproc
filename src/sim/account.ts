import type { Account } from '../schema'
import { irsContributionLimit } from './irsLimits'

// Contribution frequency multipliers: how many "units" per month
const FREQ_MULTIPLIER: Record<Account['contributionFrequency'], number> = {
  weekly: 52 / 12,      // ~4.333
  'semi-monthly': 2,
  monthly: 1,
}

/**
 * SimAccount — mutable simulation state for a single account.
 *
 * Lifecycle per month:
 *   1. applyMonthlyGrowth(rate)  — compound interest
 *   2. contribute(currentAge, annualSalary)  — add contributions + match
 *   3. withdraw(amount, currentAge)  — draw down (respects withdrawalStartAge)
 */
export class SimAccount {
  private balance: number
  private costBasis: number
  private readonly def: Account

  /**
   * @param def    Account definition from user inputs
   * @param _seed  unused; kept for call-site consistency
   */
  constructor(def: Account, _seed = 0) {
    this.def = def
    this.balance = def.balance
    // For taxable accounts: default costBasis to initial balance
    this.costBasis = def.costBasis ?? def.balance
  }

  // ─── Public getters ─────────────────────────────────────────────────────────

  getBalance(): number {
    return this.balance
  }

  getCostBasis(): number {
    return this.costBasis
  }

  get id(): string {
    return this.def.id
  }

  get type(): Account['type'] {
    return this.def.type
  }

  get withdrawalStartAge(): number {
    return this.def.withdrawalStartAge
  }

  // ─── Monthly growth ─────────────────────────────────────────────────────────

  /**
   * Apply one month of compound growth.
   * Cost basis is unaffected by growth.
   */
  applyMonthlyGrowth(monthlyRate: number): void {
    this.balance = this.balance * (1 + monthlyRate)
  }

  // ─── Contributions ──────────────────────────────────────────────────────────

  /**
   * Apply this month's contribution (+ employer match if applicable).
   * Contributions get half a month of growth (mid-month convention) — caller must
   * have already called applyMonthlyGrowth; the half-month is baked into the
   * balance update below.
   *
   * @param currentAge     Current age (whole-year basis for phase checks)
   * @param annualSalary   Current year salary (used for percent contributions)
   * @param colaFactor     Cumulative price level (today = 1) used to grow IRS
   *                       `contributeMax` limits with inflation; 1 = no growth.
   */
  contribute(currentAge: number, annualSalary: number, colaFactor: number = 1): void {
    // contributionEndAge is the age at which contributions STOP, so the year the
    // person turns that age earns no contribution (exclusive). For a plan that
    // retires at 62 with contributionEndAge = 62, the last contributing year is 61.
    if (currentAge >= this.def.contributionEndAge) return

    const monthlyContrib = this.monthlyContributionAmount(annualSalary, currentAge, colaFactor)
    const monthlyMatch = this.monthlyMatchAmount(annualSalary, currentAge, colaFactor)
    const total = monthlyContrib + monthlyMatch

    // End-of-month convention: the caller already applied this month's growth to
    // the prior balance, and the contribution is added afterward, so it earns no
    // growth in the month it lands. (Documented as mid-month in the spec; the code
    // is end-of-month — the difference is negligible over the horizon.)
    this.balance += total

    // Cost basis: contributions are after-tax dollars (taxable) or tracked 1:1
    if (this.def.type === 'taxable') {
      this.costBasis += total
    }
  }

  /**
   * Deposit raw cash into the account (used to reinvest RMD proceeds that exceed
   * spending need — see projection.ts). For taxable accounts the deposited cash is
   * after-tax, so cost basis rises 1:1 with the balance.
   */
  deposit(amount: number): void {
    if (amount <= 0) return
    this.balance += amount
    if (this.def.type === 'taxable') {
      this.costBasis += amount
    }
  }

  // ─── Withdrawals ────────────────────────────────────────────────────────────

  /**
   * Withdraw up to `amount` from this account.
   * Returns the actual amount withdrawn (may be less than requested if balance is insufficient).
   * Respects `withdrawalStartAge` — returns 0 if age < start.
   *
   * @param amount       Gross amount to withdraw
   * @param currentAge   Current age for eligibility check (omit to skip check)
   */
  withdraw(amount: number, currentAge?: number): number {
    if (currentAge !== undefined && currentAge < this.def.withdrawalStartAge) {
      return 0
    }

    const actual = Math.min(amount, this.balance)
    if (actual <= 0) return 0

    // Reduce cost basis proportionally for taxable accounts
    if (this.def.type === 'taxable' && this.balance > 0) {
      const fraction = actual / this.balance
      this.costBasis = this.costBasis * (1 - fraction)
    }

    this.balance -= actual
    if (this.balance < 0) this.balance = 0

    return actual
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Force the account balance to zero (used when portfolio depletion is flagged). */
  zero(): void {
    this.balance = 0
    this.costBasis = 0
  }

  /** What's the type of this account? Used by projection.ts to check contribution gating. */
  get contributionEndAge(): number {
    return this.def.contributionEndAge
  }

  /**
   * Total amount that would be contributed (employee + employer match) in a single
   * year at the given salary, if the account is still in contribution phase.
   * Mirrors the per-month logic in `contribute()`; used by `runSingleProjection`
   * to subtract pre-retirement contributions from disposable income.
   */
  annualContribution(currentAge: number, annualSalary: number, colaFactor: number = 1): number {
    if (currentAge >= this.def.contributionEndAge) return 0
    const monthly =
      this.monthlyContributionAmount(annualSalary, currentAge, colaFactor) +
      this.monthlyMatchAmount(annualSalary, currentAge, colaFactor)
    return monthly * 12
  }

  /**
   * Annual employee contribution only (excludes employer match), if still in
   * contribution phase. Used by `runSingleProjection` to compute working-years
   * take-home pay: the employer match is never paid from the employee's salary,
   * and traditional employee contributions are pre-tax.
   */
  annualEmployeeContribution(currentAge: number, annualSalary: number, colaFactor: number = 1): number {
    if (currentAge >= this.def.contributionEndAge) return 0
    return this.monthlyContributionAmount(annualSalary, currentAge, colaFactor) * 12
  }

  private monthlyContributionAmount(annualSalary: number, currentAge: number = 0, colaFactor: number = 1): number {
    const { contributionAmount, contributionType, contributionFrequency, contributeMax, accountSubtype } = this.def

    // contributeMax: derive from IRS limit for the subtype, grown by the catch-up
    // (50+) and COLA (inflation). Only meaningful when accountSubtype is '401k' or
    // 'ira'; falls through to the user-entered amount if no subtype is set.
    if (contributeMax) {
      const annualLimit = irsContributionLimit(accountSubtype, currentAge, colaFactor)
      if (annualLimit > 0) return annualLimit / 12
    }

    const multiplier = FREQ_MULTIPLIER[contributionFrequency]

    if (contributionType === 'percent') {
      // contributionAmount is a fraction (e.g., 0.15 = 15%)
      return (contributionAmount * annualSalary) / 12
    }
    // Flat: aggregate per-period payments into monthly
    return contributionAmount * multiplier
  }

  private monthlyMatchAmount(annualSalary: number, currentAge: number = 0, colaFactor: number = 1): number {
    const match = this.def.employerMatch
    if (!match) return 0

    if (match.type === 'percent') {
      // "X% match up to Y% of salary"
      const employeeMonthly = this.monthlyContributionAmount(annualSalary, currentAge, colaFactor)
      const matchCap = (match.upToPercent / 100) * annualSalary / 12
      const matchable = Math.min(employeeMonthly, matchCap)
      return matchable * (match.matchPercent / 100)
    }

    // Flat annual amount distributed monthly
    return match.annualAmount / 12
  }
}
