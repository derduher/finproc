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

/** Commonly-missed expenses offered as one-click suggestions in step 3. */
export const EXPENSE_SUGGESTIONS: ReadonlyArray<Omit<IntakeExpenseDraft, 'id'>> = [
  { label: 'Medicare + supplements', category: 'healthcare', amount: 7000, period: 'yearly', essential: true },
  { label: 'Long-term care reserve', category: 'healthcare', amount: 5000, period: 'yearly', essential: true },
  { label: 'Vehicle replacement', category: 'transportation', amount: 5000, period: 'yearly', essential: false },
]

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
      return { ...state, draft: { ...state.draft, accounts: state.draft.accounts.filter((a) => a.id !== action.id) } }
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

function toAccount(d: IntakeAccountDraft, retireAge: number): Account {
  const { type, subtype } = KIND_MAP[d.kind]
  const taxable = type === 'taxable'
  const acct: Account = {
    id: d.id,
    name: d.name,
    type,
    balance: d.balance,
    contributionAmount: taxable ? d.contributionAmount ?? 0 : d.contributeMax ? 0 : d.contributionAmount ?? 0,
    contributionType: 'flat',
    contributionFrequency: d.contributionFrequency ?? 'monthly',
    contributionEndAge: retireAge,
    withdrawalStartAge: retireAge,
    stockAllocation: Math.max(0, Math.min(1, d.stockAllocationPct / 100)),
  }
  if (taxable) acct.costBasis = d.balance
  if (subtype) acct.accountSubtype = subtype
  if (!taxable && d.contributeMax) acct.contributeMax = true
  // Employer match only applies to pre-tax (traditional) accounts.
  if (type === 'traditional' && d.employerMatch) acct.employerMatch = d.employerMatch
  return acct
}

function toExpenseItem(d: IntakeExpenseDraft): ExpenseItem {
  return {
    id: d.id,
    label: d.label,
    category: d.category,
    annualAmountPresentDollars: d.period === 'monthly' ? Math.round(d.amount * 12) : d.amount,
    essential: d.essential,
  }
}

function toOneTime(d: IntakeOneTimeDraft): OneTimeExpense {
  return { id: d.id, label: d.label, age: d.age, amountPresentDollars: d.amount }
}

/** Build a full, validated plan from an intake draft + sensible defaults. */
export function buildIntakeInputs(draft: IntakeDraft): SimulationInputs {
  const base = defaultInputs()
  // The intake doesn't ask a retirement age — the result solves the earliest.
  // Seed a conventional baseline (65, clamped into the valid window) that the
  // explorer can then move.
  const retireAge = Math.min(Math.max(65, draft.currentAge), draft.planToAge)

  const baselineExpenses = draft.expenses.map(toExpenseItem)
  const annualExpenses = baselineExpenses.reduce((sum, e) => sum + e.annualAmountPresentDollars, 0)

  return {
    ...base,
    scenarioName: 'My plan',
    person: {
      ...base.person,
      currentAge: draft.currentAge,
      maxAge: draft.planToAge,
      retirementAge: retireAge,
      annualSalary: draft.salary,
    },
    accounts: draft.accounts.map((a) => toAccount(a, retireAge)),
    annualExpenses,
    baselineExpenses,
    oneTimeExpenses: draft.oneTime.map(toOneTime),
    socialSecurity:
      draft.ss.monthly > 0
        ? { annualAmountPresentDollars: Math.round(draft.ss.monthly * 12), claimAge: draft.ss.claimAge }
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
