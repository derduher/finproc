/**
 * useIntake — state for the guided intake wizard.
 *
 * The flow is 6 screens: an intro (step 0) followed by the five steps that
 * gather every consequential input the model can't guess — age/salary,
 * accounts, baseline expenses, one-time costs, Social Security. The draft is a
 * UI-shaped structure; `buildIntakeInputs` converts it into a validated
 * `SimulationInputs`, reusing `defaultInputs()` for everything else (returns,
 * taxes, withdrawal order, breakpoints…).
 */
import { useReducer } from 'react'
import { defaultInputs } from '../schema'
import type {
  SimulationInputs,
  Account,
  AccountType,
  ContributionFrequency,
  EmployerMatch,
  ExpenseCategory,
  ExpenseItem,
  OneTimeExpense,
} from '../schema'

// ── Draft shapes ──────────────────────────────────────────────────────────────
/** UI account "kind" — collapses (type, accountSubtype) into one picker value. */
export type AccountKind = 'taxable' | '401k' | 'roth-401k' | 'traditional-ira' | 'roth-ira'

export interface IntakeAccountDraft {
  id: string
  name: string
  kind: AccountKind
  balance: number
  /** 0–100; the rest grows at the bond rate. */
  stockAllocationPct: number
  /** Taxable accounts: explicit per-period contribution. */
  contributionAmount?: number
  contributionFrequency?: ContributionFrequency
  /** Tax-advantaged: contribute the IRS annual maximum (ignores contributionAmount). */
  contributeMax?: boolean
  /** Pre-tax (traditional) accounts only. */
  employerMatch?: EmployerMatch
}

export interface IntakeExpenseDraft {
  id: string
  label: string
  category: ExpenseCategory
  amount: number
  period: 'monthly' | 'yearly'
  essential: boolean
}

export interface IntakeOneTimeDraft {
  id: string
  amount: number
  age: number
  label: string
}

export interface IntakeDraft {
  currentAge: number
  salary: number
  planToAge: number
  accounts: IntakeAccountDraft[]
  expenses: IntakeExpenseDraft[]
  oneTime: IntakeOneTimeDraft[]
  ss: { monthly: number; claimAge: number }
}

export interface IntakeState {
  step: number
  draft: IntakeDraft
}

/** intro + 5 steps. */
export const INTAKE_STEP_COUNT = 6

/** The five rail steps (the intro is pre-rail). */
export const INTAKE_STEPS = [
  { t: 'About you', s: 'Age & salary' },
  { t: 'Accounts', s: "What you've saved" },
  { t: 'Expenses', s: 'Yearly spending' },
  { t: 'One-time costs', s: 'Big planned outlays' },
  { t: 'Social Security', s: 'Expected benefit' },
] as const

// The step-3 expense suggestions come from the shared, context-aware catalog in
// `sim/expenseSuggestions` (same source the Advanced drawer uses) — see
// `suggestedExpensesForDraft`.

let uidCounter = 0
function uid(prefix: string): string {
  uidCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`
}

// ── Initial draft ─────────────────────────────────────────────────────────────
export function initialIntakeState(): IntakeState {
  return {
    step: 0,
    draft: {
      currentAge: 45,
      salary: 120_000,
      planToAge: 95,
      accounts: [
        { id: uid('acct'), name: '401(k)', kind: '401k', balance: 0, stockAllocationPct: 100, contributeMax: true },
        { id: uid('acct'), name: 'Brokerage', kind: 'taxable', balance: 0, stockAllocationPct: 90, contributionAmount: 0, contributionFrequency: 'monthly' },
      ],
      expenses: [
        { id: uid('exp'), label: 'General living', category: 'discretionary', amount: 60_000, period: 'yearly', essential: false },
      ],
      oneTime: [],
      ss: { monthly: 2_500, claimAge: 67 },
    },
  }
}

function newAccount(): IntakeAccountDraft {
  return { id: uid('acct'), name: 'New account', kind: '401k', balance: 0, stockAllocationPct: 100, contributeMax: true }
}

function newExpense(preset?: Omit<IntakeExpenseDraft, 'id'>): IntakeExpenseDraft {
  return { id: uid('exp'), label: 'New expense', category: 'discretionary', amount: 0, period: 'yearly', essential: false, ...preset }
}

function newOneTime(): IntakeOneTimeDraft {
  return { id: uid('one'), amount: 0, age: 60, label: 'Big expense' }
}

// ── Reducer ───────────────────────────────────────────────────────────────────
export type IntakeAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'goto'; step: number }
  | { type: 'patchDraft'; patch: Partial<IntakeDraft> }
  | { type: 'addAccount' }
  | { type: 'updateAccount'; id: string; patch: Partial<IntakeAccountDraft> }
  | { type: 'removeAccount'; id: string }
  | { type: 'addExpense'; preset?: Omit<IntakeExpenseDraft, 'id'> }
  | { type: 'updateExpense'; id: string; patch: Partial<IntakeExpenseDraft> }
  | { type: 'removeExpense'; id: string }
  | { type: 'addOneTime' }
  | { type: 'updateOneTime'; id: string; patch: Partial<IntakeOneTimeDraft> }
  | { type: 'removeOneTime'; id: string }

const clampStep = (n: number) => Math.max(0, Math.min(INTAKE_STEP_COUNT - 1, n))

export function intakeReducer(state: IntakeState, action: IntakeAction): IntakeState {
  switch (action.type) {
    case 'next':
      return { ...state, step: clampStep(state.step + 1) }
    case 'back':
      return { ...state, step: clampStep(state.step - 1) }
    case 'goto':
      return { ...state, step: clampStep(action.step) }
    case 'patchDraft':
      return { ...state, draft: { ...state.draft, ...action.patch } }
    case 'addAccount':
      return { ...state, draft: { ...state.draft, accounts: [...state.draft.accounts, newAccount()] } }
    case 'updateAccount':
      return {
        ...state,
        draft: {
          ...state.draft,
          accounts: state.draft.accounts.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a)),
        },
      }
    case 'removeAccount':
      // Keep at least one account — the app gates onboarding on an empty list,
      // so emptying it would strand the user back on the wizard.
      return state.draft.accounts.length <= 1
        ? state
        : { ...state, draft: { ...state.draft, accounts: state.draft.accounts.filter((a) => a.id !== action.id) } }
    case 'addExpense':
      return { ...state, draft: { ...state.draft, expenses: [...state.draft.expenses, newExpense(action.preset)] } }
    case 'updateExpense':
      return {
        ...state,
        draft: {
          ...state.draft,
          expenses: state.draft.expenses.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
        },
      }
    case 'removeExpense':
      return { ...state, draft: { ...state.draft, expenses: state.draft.expenses.filter((e) => e.id !== action.id) } }
    case 'addOneTime':
      return { ...state, draft: { ...state.draft, oneTime: [...state.draft.oneTime, newOneTime()] } }
    case 'updateOneTime':
      return {
        ...state,
        draft: {
          ...state.draft,
          oneTime: state.draft.oneTime.map((o) => (o.id === action.id ? { ...o, ...action.patch } : o)),
        },
      }
    case 'removeOneTime':
      return { ...state, draft: { ...state.draft, oneTime: state.draft.oneTime.filter((o) => o.id !== action.id) } }
    default:
      return state
  }
}

// ── Draft → SimulationInputs ────────────────────────────────────────────────────
const KIND_MAP: Record<AccountKind, { type: AccountType; subtype?: '401k' | 'ira' }> = {
  taxable: { type: 'taxable' },
  '401k': { type: 'traditional', subtype: '401k' },
  'roth-401k': { type: 'roth', subtype: '401k' },
  'traditional-ira': { type: 'traditional', subtype: 'ira' },
  'roth-ira': { type: 'roth', subtype: 'ira' },
}

/** Round-and-clamp into an integer range, treating NaN/Infinity as the floor. */
function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.round(v)
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

/** Clamp a non-negative dollar amount, treating NaN/Infinity as 0. */
function nonNeg(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0
}

function toAccount(d: IntakeAccountDraft, retireAge: number): Account {
  const { type, subtype } = KIND_MAP[d.kind]
  const taxable = type === 'taxable'

  // Taxable accounts enter a per-period amount (with a frequency selector). A
  // manual non-maxed tax-advantaged contribution is entered as an *annual*
  // amount ("/ yr" in the UI), so store it as the monthly equivalent — the
  // engine reads flat `contributionAmount` per `contributionFrequency`.
  let contributionAmount: number
  let contributionFrequency: ContributionFrequency
  if (taxable) {
    contributionAmount = nonNeg(d.contributionAmount ?? 0)
    contributionFrequency = d.contributionFrequency ?? 'monthly'
  } else if (d.contributeMax) {
    contributionAmount = 0
    contributionFrequency = 'monthly'
  } else {
    contributionAmount = nonNeg(d.contributionAmount ?? 0) / 12
    contributionFrequency = 'monthly'
  }

  const balance = nonNeg(d.balance)
  const pct = Number.isFinite(d.stockAllocationPct) ? d.stockAllocationPct : 100
  const acct: Account = {
    id: d.id,
    name: d.name.trim() || 'Account',
    type,
    balance,
    contributionAmount,
    contributionType: 'flat',
    contributionFrequency,
    contributionEndAge: retireAge,
    withdrawalStartAge: retireAge,
    stockAllocation: Math.max(0, Math.min(1, pct / 100)),
  }
  if (taxable) acct.costBasis = balance
  if (subtype) acct.accountSubtype = subtype
  if (!taxable && d.contributeMax) acct.contributeMax = true
  // Employer match only applies to pre-tax (traditional) accounts.
  if (type === 'traditional' && d.employerMatch) acct.employerMatch = d.employerMatch
  return acct
}

function toExpenseItem(d: IntakeExpenseDraft): ExpenseItem {
  return {
    id: d.id,
    label: d.label.trim() || 'Expense',
    category: d.category,
    annualAmountPresentDollars: nonNeg(d.period === 'monthly' ? Math.round(d.amount * 12) : d.amount),
    essential: d.essential,
  }
}

function toOneTime(d: IntakeOneTimeDraft): OneTimeExpense {
  return { id: d.id, label: d.label.trim() || 'One-time cost', age: clampInt(d.age, 0, 130), amountPresentDollars: nonNeg(d.amount) }
}

/**
 * Build a full, schema-valid plan from an intake draft + sensible defaults.
 *
 * Field-level clamping guards against unconstrained form entry (negative
 * numbers, ages outside the valid window, blank labels) so the result always
 * passes `SimulationInputsSchema` — `setInputs` does no validation of its own.
 */
export function buildIntakeInputs(draft: IntakeDraft): SimulationInputs {
  const base = defaultInputs()
  const currentAge = clampInt(draft.currentAge, 0, 100)
  const maxAge = clampInt(draft.planToAge, currentAge + 1, 130)
  // The intake doesn't ask a retirement age — the result solves the earliest.
  // Seed a conventional baseline (65, clamped into the valid window) that the
  // explorer can then move.
  const retireAge = clampInt(Math.max(65, currentAge), currentAge, maxAge)

  const baselineExpenses = draft.expenses.map(toExpenseItem)
  const annualExpenses = baselineExpenses.reduce((sum, e) => sum + e.annualAmountPresentDollars, 0)

  const ssMonthly = nonNeg(draft.ss.monthly)

  return {
    ...base,
    scenarioName: 'My plan',
    person: {
      ...base.person,
      currentAge,
      maxAge,
      retirementAge: retireAge,
      annualSalary: nonNeg(draft.salary),
    },
    accounts: draft.accounts.map((a) => toAccount(a, retireAge)),
    annualExpenses,
    baselineExpenses,
    oneTimeExpenses: draft.oneTime.map(toOneTime),
    socialSecurity:
      ssMonthly > 0
        ? { annualAmountPresentDollars: Math.round(ssMonthly * 12), claimAge: clampInt(draft.ss.claimAge, 62, 70) }
        : undefined,
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────────
export interface UseIntake extends IntakeState {
  dispatch: React.Dispatch<IntakeAction>
}

export function useIntake(): UseIntake {
  const [state, dispatch] = useReducer(intakeReducer, undefined, initialIntakeState)
  return { ...state, dispatch }
}
