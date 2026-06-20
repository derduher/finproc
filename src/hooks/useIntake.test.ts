/**
 * useIntake — the guided-intake reducer + buildInputs converter.
 *
 * The reducer drives a 6-screen flow (intro + 5 steps) holding a structured
 * draft; buildInputs() turns that draft into a validated SimulationInputs,
 * reusing defaultInputs() for everything the intake doesn't ask.
 */
import { describe, it, expect } from 'vitest'
import {
  intakeReducer,
  initialIntakeState,
  buildIntakeInputs,
  INTAKE_STEP_COUNT,
  type IntakeState,
  type IntakeDraft,
} from './useIntake'
import { SimulationInputsSchema } from '../schema'

function freshDraft(): IntakeDraft {
  return initialIntakeState().draft
}

describe('intakeReducer — navigation', () => {
  it('starts at the intro (step 0)', () => {
    expect(initialIntakeState().step).toBe(0)
  })

  it('next advances and clamps at the last step', () => {
    let s: IntakeState = initialIntakeState()
    for (let i = 0; i < INTAKE_STEP_COUNT + 3; i++) s = intakeReducer(s, { type: 'next' })
    expect(s.step).toBe(INTAKE_STEP_COUNT - 1)
  })

  it('back retreats and clamps at 0', () => {
    let s: IntakeState = { ...initialIntakeState(), step: 2 }
    s = intakeReducer(s, { type: 'back' })
    expect(s.step).toBe(1)
    s = intakeReducer(s, { type: 'back' })
    s = intakeReducer(s, { type: 'back' })
    expect(s.step).toBe(0)
  })

  it('goto jumps to a specific step (clamped)', () => {
    let s = intakeReducer(initialIntakeState(), { type: 'goto', step: 3 })
    expect(s.step).toBe(3)
    s = intakeReducer(s, { type: 'goto', step: 99 })
    expect(s.step).toBe(INTAKE_STEP_COUNT - 1)
  })
})

describe('intakeReducer — draft edits', () => {
  it('patchDraft merges top-level fields', () => {
    const s = intakeReducer(initialIntakeState(), { type: 'patchDraft', patch: { currentAge: 44, planToAge: 100 } })
    expect(s.draft.currentAge).toBe(44)
    expect(s.draft.planToAge).toBe(100)
  })

  it('addAccount / updateAccount / removeAccount', () => {
    let s = initialIntakeState()
    const before = s.draft.accounts.length
    s = intakeReducer(s, { type: 'addAccount' })
    expect(s.draft.accounts.length).toBe(before + 1)
    const id = s.draft.accounts[s.draft.accounts.length - 1].id
    s = intakeReducer(s, { type: 'updateAccount', id, patch: { balance: 123456, kind: 'roth-ira' } })
    const acct = s.draft.accounts.find((a) => a.id === id)!
    expect(acct.balance).toBe(123456)
    expect(acct.kind).toBe('roth-ira')
    s = intakeReducer(s, { type: 'removeAccount', id })
    expect(s.draft.accounts.find((a) => a.id === id)).toBeUndefined()
  })

  it('addExpense accepts a preset and is editable/removable', () => {
    let s = initialIntakeState()
    const before = s.draft.expenses.length
    s = intakeReducer(s, { type: 'addExpense', preset: { label: 'Medicare', category: 'healthcare', amount: 7000, period: 'yearly', essential: true } })
    expect(s.draft.expenses.length).toBe(before + 1)
    const e = s.draft.expenses[s.draft.expenses.length - 1]
    expect(e.label).toBe('Medicare')
    expect(e.essential).toBe(true)
    s = intakeReducer(s, { type: 'updateExpense', id: e.id, patch: { amount: 9000 } })
    expect(s.draft.expenses.find((x) => x.id === e.id)!.amount).toBe(9000)
    s = intakeReducer(s, { type: 'removeExpense', id: e.id })
    expect(s.draft.expenses.find((x) => x.id === e.id)).toBeUndefined()
  })

  it('addOneTime / updateOneTime / removeOneTime', () => {
    let s = initialIntakeState()
    s = intakeReducer(s, { type: 'addOneTime' })
    const o = s.draft.oneTime[s.draft.oneTime.length - 1]
    s = intakeReducer(s, { type: 'updateOneTime', id: o.id, patch: { amount: 45000, age: 52, label: 'Remodel' } })
    const got = s.draft.oneTime.find((x) => x.id === o.id)!
    expect(got).toMatchObject({ amount: 45000, age: 52, label: 'Remodel' })
    s = intakeReducer(s, { type: 'removeOneTime', id: o.id })
    expect(s.draft.oneTime.find((x) => x.id === o.id)).toBeUndefined()
  })
})

describe('buildIntakeInputs', () => {
  it('produces inputs that pass schema validation', () => {
    const inputs = buildIntakeInputs(freshDraft())
    expect(() => SimulationInputsSchema.parse(inputs)).not.toThrow()
  })

  it('maps person/age/salary and uses planToAge as maxAge', () => {
    const d: IntakeDraft = { ...freshDraft(), currentAge: 44, salary: 160000, planToAge: 95 }
    const inputs = buildIntakeInputs(d)
    expect(inputs.person.currentAge).toBe(44)
    expect(inputs.person.annualSalary).toBe(160000)
    expect(inputs.person.maxAge).toBe(95)
    expect(inputs.person.retirementAge).toBeGreaterThanOrEqual(44)
    expect(inputs.person.retirementAge).toBeLessThanOrEqual(95)
  })

  it('maps account kinds to type + subtype, sets taxable cost basis, and stock allocation', () => {
    const d: IntakeDraft = {
      ...freshDraft(),
      accounts: [
        { id: 'a1', name: 'Brokerage', kind: 'taxable', balance: 480000, stockAllocationPct: 90, contributionAmount: 1500, contributionFrequency: 'weekly' },
        { id: 'a2', name: '401(k)', kind: '401k', balance: 410000, stockAllocationPct: 100, contributeMax: true, employerMatch: { type: 'flat', annualAmount: 6000 } },
        { id: 'a3', name: 'Roth IRA', kind: 'roth-ira', balance: 120000, stockAllocationPct: 100, contributeMax: true },
      ],
    }
    const inputs = buildIntakeInputs(d)
    const [a1, a2, a3] = inputs.accounts
    expect(a1.type).toBe('taxable')
    expect(a1.costBasis).toBe(480000)
    expect(a1.stockAllocation).toBeCloseTo(0.9)
    expect(a1.contributionAmount).toBe(1500)
    expect(a1.contributionFrequency).toBe('weekly')
    expect(a2.type).toBe('traditional')
    expect(a2.accountSubtype).toBe('401k')
    expect(a2.contributeMax).toBe(true)
    expect(a2.employerMatch).toEqual({ type: 'flat', annualAmount: 6000 })
    expect(a3.type).toBe('roth')
    expect(a3.accountSubtype).toBe('ira')
  })

  it('converts monthly expenses to annual and carries essential + total', () => {
    const d: IntakeDraft = {
      ...freshDraft(),
      expenses: [
        { id: 'e1', label: 'Living', category: 'discretionary', amount: 64000, period: 'yearly', essential: false },
        { id: 'e2', label: 'Healthcare', category: 'healthcare', amount: 1000, period: 'monthly', essential: true },
      ],
    }
    const inputs = buildIntakeInputs(d)
    const healthcare = inputs.baselineExpenses!.find((e) => e.label === 'Healthcare')!
    expect(healthcare.annualAmountPresentDollars).toBe(12000)
    expect(healthcare.essential).toBe(true)
    expect(inputs.annualExpenses).toBe(76000)
  })

  it('maps the remaining account kinds and their conditionals', () => {
    const d: IntakeDraft = {
      ...freshDraft(),
      accounts: [
        // roth-401k → roth type, 401k subtype
        { id: 'r4', name: 'Roth 401(k)', kind: 'roth-401k', balance: 50_000, stockAllocationPct: 100, contributeMax: true },
        // traditional-ira → traditional type, ira subtype; not max, so contributionAmount is used
        { id: 'ti', name: 'Trad IRA', kind: 'traditional-ira', balance: 70_000, stockAllocationPct: 80, contributeMax: false, contributionAmount: 500 },
        // employer match on a Roth account is dropped (only traditional carries it)
        { id: 'ri', name: 'Roth IRA', kind: 'roth-ira', balance: 20_000, stockAllocationPct: 100, employerMatch: { type: 'flat', annualAmount: 1000 } },
        // taxable with no frequency falls back to monthly
        { id: 'tx', name: 'Brokerage', kind: 'taxable', balance: 10_000, stockAllocationPct: 100, contributionAmount: 200 },
      ],
    }
    const [r4, ti, ri, tx] = buildIntakeInputs(d).accounts
    expect(r4.type).toBe('roth')
    expect(r4.accountSubtype).toBe('401k')
    expect(ti.type).toBe('traditional')
    expect(ti.accountSubtype).toBe('ira')
    expect(ti.contributeMax).toBeUndefined()
    expect(ti.contributionAmount).toBe(500)
    expect(ri.employerMatch).toBeUndefined()
    expect(tx.contributionFrequency).toBe('monthly')
  })

  it('omits Social Security when the monthly benefit is zero', () => {
    const inputs = buildIntakeInputs({ ...freshDraft(), ss: { monthly: 0, claimAge: 67 } })
    expect(inputs.socialSecurity).toBeUndefined()
  })

  it('maps one-time costs and Social Security (monthly → annual)', () => {
    const d: IntakeDraft = {
      ...freshDraft(),
      oneTime: [{ id: 'o1', amount: 45000, age: 52, label: 'Remodel' }],
      ss: { monthly: 3000, claimAge: 67 },
    }
    const inputs = buildIntakeInputs(d)
    expect(inputs.oneTimeExpenses).toHaveLength(1)
    expect(inputs.oneTimeExpenses[0]).toMatchObject({ age: 52, amountPresentDollars: 45000, label: 'Remodel' })
    expect(inputs.socialSecurity).toEqual({ annualAmountPresentDollars: 36000, claimAge: 67 })
  })
})
