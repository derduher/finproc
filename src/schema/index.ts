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
    annualSalary: z.number().min(0),
    salaryGrowthRate: z.number().min(-1).max(1),
    marginalTaxRate: z.number().min(0).max(1),
    ltcgRate: z.number().min(0).max(1),
  })
  .refine((p) => p.maxAge > p.currentAge, {
    message: 'maxAge must be greater than currentAge',
    path: ['maxAge'],
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

    /** Additional breakpoints (sorted ascending by startAge) */
    breakpoints: z.array(BreakpointSchema),

    /** Annual baseline expenses in today's dollars */
    annualExpenses: z.number().min(0),
    socialSecurity: SocialSecuritySchema.optional(),
    oneTimeExpenses: z.array(OneTimeExpenseSchema),

    withdrawalStrategy: z.nativeEnum(WithdrawalStrategy),
    /** For user-defined strategy: account IDs in withdrawal priority order */
    withdrawalOrder: z.array(z.string()).optional(),

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
    (s) => {
      const ages = s.breakpoints.map((b) => b.startAge)
      for (let i = 1; i < ages.length; i++) {
        if (ages[i] <= ages[i - 1]) return false
      }
      return true
    },
    { message: 'Breakpoints must be in strictly ascending order by startAge', path: ['breakpoints'] },
  )

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

// ─── Default inputs ───────────────────────────────────────────────────────────
export function defaultInputs(): SimulationInputs {
  return {
    scenarioName: 'Baseline plan',
    person: {
      currentAge: 32,
      maxAge: 95,
      annualSalary: 95000,
      salaryGrowthRate: 0.03,
      marginalTaxRate: 0.24,
      ltcgRate: 0.15,
    },
    accounts: [],
    initialStockGrowthMin: 0.04,
    initialStockGrowthMax: 0.10,
    initialInflationMin: 0.02,
    initialInflationMax: 0.04,
    breakpoints: [],
    annualExpenses: 70000,
    socialSecurity: undefined,
    oneTimeExpenses: [],
    withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
    withdrawalOrder: undefined,
    seed: 0x4f2a,
  }
}
