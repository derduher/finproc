import { z } from 'zod'

// ─── Branded types ────────────────────────────────────────────────────────────
// Prevent cross-unit assignment at the type level.
declare const __brand: unique symbol
type Brand<T, B> = T & { [__brand]: B }

export type Money = Brand<number, 'Money'>
export type AgeYears = Brand<number, 'AgeYears'>
export type MonthIndex = Brand<number, 'MonthIndex'>

export const money = (n: number): Money => n as Money
export const ageYears = (n: number): AgeYears => n as AgeYears
export const monthIndex = (n: number): MonthIndex => n as MonthIndex

// ─── Enums ────────────────────────────────────────────────────────────────────
export enum WithdrawalStrategy {
  TaxOptimal = 'tax-optimal',
  Proportional = 'proportional',
  UserDefined = 'user-defined',
}

export type AccountType = 'taxable' | 'traditional' | 'roth'
export type ContributionFrequency = 'weekly' | 'semi-monthly' | 'monthly'
export type ContributionType = 'flat' | 'percent'

// ─── Employer match ───────────────────────────────────────────────────────────
const EmployerMatchPercentSchema = z.object({
  type: z.literal('percent'),
  matchPercent: z.number().min(0).max(100),
  upToPercent: z.number().min(0).max(100),
})

const EmployerMatchFlatSchema = z.object({
  type: z.literal('flat'),
  annualAmount: z.number().min(0),
})

const EmployerMatchSchema = z.discriminatedUnion('type', [
  EmployerMatchPercentSchema,
  EmployerMatchFlatSchema,
])

export type EmployerMatch = z.infer<typeof EmployerMatchSchema>

// ─── Person ───────────────────────────────────────────────────────────────────
export const PersonSchema = z
  .object({
    currentAge: z.number().int().min(0).max(100),
    maxAge: z.number().int().min(1).max(130),
    /**
     * Age at which the user stops working and starts drawing on accounts.
     * Drives chart markers and the default contributionEndAge / withdrawalStartAge
     * on new accounts. Defaults to 62 (typical earliest-Social-Security target)
     * for back-compat with older URLs that didn't carry this field.
     */
    retirementAge: z.number().int().min(0).max(130).default(62),
    annualSalary: z.number().min(0),
    salaryGrowthRate: z.number().min(-1).max(1),
    marginalTaxRate: z.number().min(0).max(1),
    ltcgRate: z.number().min(0).max(1),
    /**
     * Tax filing status. Drives the standard deduction, ordinary brackets, LTCG
     * breakpoints, and Social Security taxation thresholds in the withdrawal-phase
     * tax model ([`sim/tax.ts`]). Optional for back-compat with older URLs; the
     * engine treats an absent value as 'single' (matching the single-person model).
     */
    filingStatus: z.enum(['single', 'married']).optional(),
  })
  .refine((p) => p.maxAge > p.currentAge, {
    message: 'maxAge must be greater than currentAge',
    path: ['maxAge'],
  })
  .refine((p) => p.retirementAge >= p.currentAge && p.retirementAge <= p.maxAge, {
    message: 'retirementAge must be between currentAge and maxAge (inclusive)',
    path: ['retirementAge'],
  })

export type Person = z.infer<typeof PersonSchema>

// ─── Account ─────────────────────────────────────────────────────────────────
export const AccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['taxable', 'traditional', 'roth']),
  balance: z.number().min(0),
  /** Only used for taxable accounts; defaults to balance if omitted */
  costBasis: z.number().min(0).optional(),
  contributionAmount: z.number().min(0),
  contributionType: z.enum(['flat', 'percent']),
  contributionFrequency: z.enum(['weekly', 'semi-monthly', 'monthly']),
  contributionEndAge: z.number().int().min(0).max(130),
  withdrawalStartAge: z.number().int().min(0).max(130),
  /** Only for traditional accounts */
  employerMatch: EmployerMatchSchema.optional(),
  /**
   * Refines the account `type` for IRS-limit purposes. Only meaningful when
   * type is 'traditional' or 'roth'; taxable accounts have no IRS cap.
   * Optional for back-compat with URLs that predate this field.
   */
  accountSubtype: z.enum(['401k', 'ira', 'other']).optional(),
  /**
   * When true, the simulation ignores `contributionAmount` and uses the
   * annual IRS limit for `accountSubtype` (divided by 12, monthly).
   * Only effective when accountSubtype is '401k' or 'ira'.
   */
  contributeMax: z.boolean().optional(),
  /**
   * Fraction of this account held in stocks (the rest grows at the bond rate).
   * Optional for back-compat with URLs that predate the field; omitted means
   * 100% stocks (the original single-asset behavior).
   */
  stockAllocation: z.number().min(0).max(1).optional(),
})

export type Account = z.infer<typeof AccountSchema>

// ─── Breakpoint ───────────────────────────────────────────────────────────────
export const BreakpointSchema = z
  .object({
    startAge: z.number().int().min(0).max(130),
    stockGrowthMin: z.number().min(-1).max(2),
    stockGrowthMax: z.number().min(-1).max(2),
    inflationMin: z.number().min(-1).max(1),
    inflationMax: z.number().min(-1).max(1),
  })
  .refine((b) => b.stockGrowthMax >= b.stockGrowthMin, {
    message: 'stockGrowthMax must be >= stockGrowthMin',
    path: ['stockGrowthMax'],
  })
  .refine((b) => b.inflationMax >= b.inflationMin, {
    message: 'inflationMax must be >= inflationMin',
    path: ['inflationMax'],
  })

export type Breakpoint = z.infer<typeof BreakpointSchema>

// ─── One-time expense ─────────────────────────────────────────────────────────
export const OneTimeExpenseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Age at which this expense occurs */
  age: z.number().int().min(0).max(130),
  /** Amount in today's dollars; inflated to event date */
  amountPresentDollars: z.number().min(0),
  /** Optional annual recurring follow-on (today's dollars, inflated from event date) */
  recurringFollowOnAmount: z.number().min(0).optional(),
})

export type OneTimeExpense = z.infer<typeof OneTimeExpenseSchema>

// ─── Baseline expense line items ──────────────────────────────────────────────
/** Coarse buckets used to group baseline spending and to seed suggested expenses. */
export const EXPENSE_CATEGORIES = [
  'housing',
  'healthcare',
  'food',
  'transportation',
  'insurance',
  'taxes',
  'discretionary',
  'other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/** A single baseline (recurring annual) expense, in today's dollars. */
export const ExpenseItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  category: z.enum(EXPENSE_CATEGORIES),
  /** Annual amount in today's dollars; inflated forward like the aggregate baseline. */
  annualAmountPresentDollars: z.number().min(0),
  /**
   * Whether this item is a non-negotiable need. The sum of essential items is
   * the guardrails spending floor: market-driven cuts never take the annual
   * spend below it. Unset (back-compat URLs) falls back to a category default
   * — see `isEssentialExpense` in `sim/expenses.ts`.
   */
  essential: z.boolean().optional(),
})

export type ExpenseItem = z.infer<typeof ExpenseItemSchema>

// ─── Social Security ──────────────────────────────────────────────────────────
const SocialSecuritySchema = z.object({
  annualAmountPresentDollars: z.number().min(0),
  claimAge: z.number().int().min(62).max(70),
})

export type SocialSecurity = z.infer<typeof SocialSecuritySchema>

// ─── Simulation inputs ────────────────────────────────────────────────────────
export const SimulationInputsSchema = z
  .object({
    /** User-given name for this plan (shown in the TopBar chip) */
    scenarioName: z.string().min(1).max(80),
    person: PersonSchema,
    accounts: z.array(AccountSchema).min(0),

    /** Initial segment stock growth (P10/P90 → σ derived) */
    initialStockGrowthMin: z.number().min(-1).max(2),
    initialStockGrowthMax: z.number().min(-1).max(2),
    /** Initial segment inflation (P10/P90) */
    initialInflationMin: z.number().min(-1).max(1),
    initialInflationMax: z.number().min(-1).max(1),

    /**
     * Long-run bond return band (P10/P90, nominal), applied to the non-stock
     * fraction of any account with `stockAllocation < 1`. Global (not per
     * breakpoint segment). Optional for back-compat; defaults to
     * {@link DEFAULT_BOND_BAND} when omitted.
     */
    bondGrowthMin: z.number().min(-1).max(1).optional(),
    bondGrowthMax: z.number().min(-1).max(1).optional(),

    /** Additional breakpoints (sorted ascending by startAge) */
    breakpoints: z.array(BreakpointSchema),

    /**
     * Aggregate annual baseline expenses in today's dollars. Kept as the canonical
     * scalar consumed by the simulation/solvers; the `transform` below derives it
     * from `baselineExpenses` so the breakdown is the effective source of truth.
     */
    annualExpenses: z.number().min(0),
    /**
     * Itemized baseline spending. Optional on input for back-compat with URLs that
     * predate itemization; the `transform` normalizes it to always be present
     * (a single "General living" item synthesized from `annualExpenses` when absent).
     */
    baselineExpenses: z.array(ExpenseItemSchema).optional(),
    socialSecurity: SocialSecuritySchema.optional(),
    oneTimeExpenses: z.array(OneTimeExpenseSchema),

    withdrawalStrategy: z.nativeEnum(WithdrawalStrategy),
    /** For user-defined strategy: account IDs in withdrawal priority order */
    withdrawalOrder: z.array(z.string()).optional(),

    /**
     * Spending policy: how the annual draw responds to market performance.
     * - 'flat' (default): the same real spend every year, come what may.
     * - 'guardrails': Guyton-Klinger-style flex — trim ~10% when the withdrawal
     *   rate drifts >20% above its retirement-start baseline, raise ~10% when it
     *   drifts >20% below. Optional for back-compat with URLs predating this field.
     */
    spendingPolicy: z.enum(['flat', 'guardrails']).optional(),

    /**
     * Longevity model.
     * - 'fixed' (default): every run ends at `person.maxAge` — a single hard death
     *   date, so the headline depends on an arbitrary horizon input.
     * - 'stochastic': each run draws its own age at death from a Gompertz mortality
     *   model ([`sim/mortality.ts`]), so the success rate is an expectation over the
     *   *distribution* of lifespans. Optional for back-compat with older URLs.
     */
    longevity: z.enum(['fixed', 'stochastic']).optional(),

    /** PRNG seed for reproducibility */
    seed: z.number().int(),
  })
  .refine((s) => s.initialStockGrowthMax >= s.initialStockGrowthMin, {
    message: 'initialStockGrowthMax must be >= initialStockGrowthMin',
    path: ['initialStockGrowthMax'],
  })
  .refine((s) => s.initialInflationMax >= s.initialInflationMin, {
    message: 'initialInflationMax must be >= initialInflationMin',
    path: ['initialInflationMax'],
  })
  .refine(
    (s) =>
      s.bondGrowthMin === undefined ||
      s.bondGrowthMax === undefined ||
      s.bondGrowthMax >= s.bondGrowthMin,
    {
      message: 'bondGrowthMax must be >= bondGrowthMin',
      path: ['bondGrowthMax'],
    },
  )
  .refine(
    (s) => {
      const ages = s.breakpoints.map((b) => b.startAge)
      for (let i = 1; i < ages.length; i++) {
        if (ages[i] <= ages[i - 1]) return false
      }
      return true
    },
    { message: 'Breakpoints must be in strictly ascending order by startAge', path: ['breakpoints'] },
  )
  // Normalize the baseline-expense pair so they're always consistent:
  //   • itemized → `annualExpenses` is the sum of the items (items win)
  //   • legacy aggregate-only → synthesize a single "General living" item
  // After parse, `baselineExpenses` is always present and `annualExpenses` always
  // equals its sum, so the simulation (which reads `annualExpenses`) is unchanged.
  .transform((s) => {
    const items =
      s.baselineExpenses && s.baselineExpenses.length > 0
        ? s.baselineExpenses
        : [
            {
              id: 'general',
              label: 'General living',
              category: 'other' as const,
              annualAmountPresentDollars: s.annualExpenses,
            },
          ]
    const annualExpenses = items.reduce((sum, it) => sum + it.annualAmountPresentDollars, 0)
    return { ...s, baselineExpenses: items, annualExpenses }
  })

export type SimulationInputs = z.infer<typeof SimulationInputsSchema>

// ─── Simulation result ────────────────────────────────────────────────────────
export interface YearlyResult {
  age: number
  p10: number
  p50: number
  p90: number
}

export interface SimulationResult {
  yearlyResults: YearlyResult[]
  successRate: number
  /** Median ending balance (nominal) */
  medianEndBalance: number
  p10EndBalance: number
  /** Median age at depletion across failing runs; undefined if all runs succeed */
  medianDepleteAge: number | undefined
  /** Tornado data for sensitivity chart */
  sensitivity?: SensitivityResult[]
}

export interface SensitivityResult {
  label: string
  sub: string
  /** Success rate delta when input is reduced 20% */
  loDelta: number
  /** Success rate delta when input is increased 20% */
  hiDelta: number
}

/**
 * Historical NOMINAL market assumptions, expressed as P10/P90 bands.
 * Stock growth: P10 ~4.4%, P90 ~13.5% (implied median ~9%).
 * Inflation: P10 ~-1.5%, P90 ~8.75%.
 * Used by the "historical defaults" preset in the markets step.
 */
export const HISTORICAL_MARKET_DEFAULTS = {
  stockGrowthMin: 0.044,
  stockGrowthMax: 0.135,
  inflationMin: -0.015,
  inflationMax: 0.0875,
} as const

/**
 * Default long-run NOMINAL bond return band (P10/P90), used when the inputs
 * omit `bondGrowthMin/Max`. Centered near the historical intermediate-Treasury
 * average (~4%), with epistemic spread on the long-run mean — per-year bond
 * volatility is layered on separately by the engine.
 */
export const DEFAULT_BOND_BAND = { min: 0.02, max: 0.06 } as const

// ─── Default inputs ───────────────────────────────────────────────────────────
export function defaultInputs(): SimulationInputs {
  return {
    scenarioName: 'Baseline plan',
    person: {
      currentAge: 32,
      maxAge: 95,
      retirementAge: 62,
      annualSalary: 95000,
      salaryGrowthRate: 0.03,
      marginalTaxRate: 0.24,
      ltcgRate: 0.15,
      filingStatus: 'single',
    },
    accounts: [],
    initialStockGrowthMin: 0.04,
    initialStockGrowthMax: 0.10,
    initialInflationMin: 0.02,
    initialInflationMax: 0.04,
    breakpoints: [],
    annualExpenses: 70000,
    baselineExpenses: [
      { id: 'general', label: 'General living', category: 'other', annualAmountPresentDollars: 70000 },
    ],
    socialSecurity: undefined,
    oneTimeExpenses: [],
    withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
    withdrawalOrder: undefined,
    spendingPolicy: 'guardrails',
    longevity: 'fixed',
    seed: 0x4f2a,
  }
}
