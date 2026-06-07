import { describe, it, expect } from 'vitest'
import {
  PersonSchema,
  AccountSchema,
  BreakpointSchema,
  OneTimeExpenseSchema,
  SimulationInputsSchema,
  WithdrawalStrategy,
  defaultInputs,
} from './index'

describe('AccountSchema — accountSubtype + contributeMax', () => {
  const base = {
    id: 'a1',
    name: 'My 401k',
    type: 'traditional' as const,
    balance: 100000,
    contributionAmount: 1000,
    contributionType: 'flat' as const,
    contributionFrequency: 'monthly' as const,
    contributionEndAge: 62,
    withdrawalStartAge: 59,
  }

  it('accepts account with accountSubtype="401k" and contributeMax=true', () => {
    const r = AccountSchema.safeParse({ ...base, accountSubtype: '401k', contributeMax: true })
    expect(r.success).toBe(true)
  })

  it('accepts account with accountSubtype="ira"', () => {
    const r = AccountSchema.safeParse({ ...base, accountSubtype: 'ira' })
    expect(r.success).toBe(true)
  })

  it('accepts account with accountSubtype="other"', () => {
    const r = AccountSchema.safeParse({ ...base, accountSubtype: 'other' })
    expect(r.success).toBe(true)
  })

  it('accepts account without these new optional fields (back-compat)', () => {
    const r = AccountSchema.safeParse(base)
    expect(r.success).toBe(true)
  })

  it('rejects an unknown accountSubtype value', () => {
    const r = AccountSchema.safeParse({ ...base, accountSubtype: 'roth-ira' })
    expect(r.success).toBe(false)
  })
})

describe('PersonSchema', () => {
  it('accepts valid person', () => {
    const result = PersonSchema.safeParse({
      currentAge: 32,
      maxAge: 95,
      annualSalary: 95000,
      salaryGrowthRate: 0.03,
      marginalTaxRate: 0.24,
      ltcgRate: 0.15,
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative age', () => {
    const result = PersonSchema.safeParse({
      currentAge: -1,
      maxAge: 95,
      annualSalary: 95000,
      salaryGrowthRate: 0.03,
      marginalTaxRate: 0.24,
      ltcgRate: 0.15,
    })
    expect(result.success).toBe(false)
  })

  it('rejects tax rates outside 0-1', () => {
    const result = PersonSchema.safeParse({
      currentAge: 32,
      maxAge: 95,
      annualSalary: 95000,
      salaryGrowthRate: 0.03,
      marginalTaxRate: 1.5,
      ltcgRate: 0.15,
    })
    expect(result.success).toBe(false)
  })

  it('rejects maxAge <= currentAge', () => {
    const result = PersonSchema.safeParse({
      currentAge: 65,
      maxAge: 60,
      annualSalary: 95000,
      salaryGrowthRate: 0.03,
      marginalTaxRate: 0.24,
      ltcgRate: 0.15,
    })
    expect(result.success).toBe(false)
  })

  it('accepts retirementAge when present', () => {
    const result = PersonSchema.safeParse({
      currentAge: 32,
      maxAge: 95,
      retirementAge: 65,
      annualSalary: 95000,
      salaryGrowthRate: 0.03,
      marginalTaxRate: 0.24,
      ltcgRate: 0.15,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.retirementAge).toBe(65)
  })

  it('fills in default retirementAge when missing (back-compat with older URLs)', () => {
    const result = PersonSchema.safeParse({
      currentAge: 32,
      maxAge: 95,
      annualSalary: 95000,
      salaryGrowthRate: 0.03,
      marginalTaxRate: 0.24,
      ltcgRate: 0.15,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // Default retirementAge should be a sensible value between currentAge and maxAge.
      expect(typeof result.data.retirementAge).toBe('number')
      expect(result.data.retirementAge).toBeGreaterThan(0)
      expect(result.data.retirementAge).toBeLessThan(100)
    }
  })

  it('rejects retirementAge outside [currentAge, maxAge]', () => {
    const result = PersonSchema.safeParse({
      currentAge: 50,
      maxAge: 95,
      retirementAge: 40, // before currentAge
      annualSalary: 95000,
      salaryGrowthRate: 0.03,
      marginalTaxRate: 0.24,
      ltcgRate: 0.15,
    })
    expect(result.success).toBe(false)
  })
})

describe('AccountSchema', () => {
  it('accepts valid traditional account', () => {
    const result = AccountSchema.safeParse({
      id: 'acc-1',
      name: 'Fidelity 401k',
      type: 'traditional',
      balance: 180000,
      costBasis: 180000,
      contributionAmount: 14250,
      contributionType: 'flat',
      contributionFrequency: 'monthly',
      contributionEndAge: 62,
      withdrawalStartAge: 59,
      employerMatch: { type: 'percent', matchPercent: 100, upToPercent: 6 },
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative balance', () => {
    const result = AccountSchema.safeParse({
      id: 'acc-1',
      name: 'Test',
      type: 'roth',
      balance: -100,
      contributionAmount: 0,
      contributionType: 'flat',
      contributionFrequency: 'monthly',
      contributionEndAge: 62,
      withdrawalStartAge: 59,
    })
    expect(result.success).toBe(false)
  })
})

describe('BreakpointSchema', () => {
  it('rejects min > max for stock growth', () => {
    const result = BreakpointSchema.safeParse({
      startAge: 65,
      stockGrowthMin: 0.10,
      stockGrowthMax: 0.04,
      inflationMin: 0.02,
      inflationMax: 0.04,
    })
    expect(result.success).toBe(false)
  })

  it('rejects min > max for inflation', () => {
    const result = BreakpointSchema.safeParse({
      startAge: 65,
      stockGrowthMin: 0.04,
      stockGrowthMax: 0.10,
      inflationMin: 0.05,
      inflationMax: 0.02,
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid breakpoint', () => {
    const result = BreakpointSchema.safeParse({
      startAge: 65,
      stockGrowthMin: 0.03,
      stockGrowthMax: 0.07,
      inflationMin: 0.02,
      inflationMax: 0.04,
    })
    expect(result.success).toBe(true)
  })
})

describe('OneTimeExpenseSchema', () => {
  it('accepts valid one-time expense', () => {
    const result = OneTimeExpenseSchema.safeParse({
      id: 'exp-1',
      label: 'House down payment',
      age: 36,
      amountPresentDollars: 80000,
    })
    expect(result.success).toBe(true)
  })

  it('accepts expense with recurring follow-on', () => {
    const result = OneTimeExpenseSchema.safeParse({
      id: 'exp-2',
      label: 'House',
      age: 36,
      amountPresentDollars: 80000,
      recurringFollowOnAmount: 24000,
    })
    expect(result.success).toBe(true)
  })
})

describe('SimulationInputsSchema', () => {
  it('rejects breakpoints out of order', () => {
    const base = defaultInputs()
    const result = SimulationInputsSchema.safeParse({
      ...base,
      breakpoints: [
        { startAge: 70, stockGrowthMin: 0.03, stockGrowthMax: 0.07, inflationMin: 0.02, inflationMax: 0.04 },
        { startAge: 60, stockGrowthMin: 0.03, stockGrowthMax: 0.07, inflationMin: 0.02, inflationMax: 0.04 },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid default inputs', () => {
    const result = SimulationInputsSchema.safeParse(defaultInputs())
    expect(result.success).toBe(true)
  })
})

describe('SimulationInputsSchema — baseline expense itemization', () => {
  it('migrates a legacy annualExpenses-only input into a single line item', () => {
    const { baselineExpenses, ...legacy } = defaultInputs()
    void baselineExpenses
    const result = SimulationInputsSchema.safeParse({ ...legacy, annualExpenses: 64_000 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.baselineExpenses).toHaveLength(1)
    expect(result.data.baselineExpenses[0].annualAmountPresentDollars).toBe(64_000)
    expect(result.data.annualExpenses).toBe(64_000)
  })

  it('derives annualExpenses from the sum of baselineExpenses when itemized', () => {
    const result = SimulationInputsSchema.safeParse({
      ...defaultInputs(),
      annualExpenses: 1, // stale aggregate — should be overwritten by the sum
      baselineExpenses: [
        { id: 'h', label: 'Housing', category: 'housing', annualAmountPresentDollars: 30_000 },
        { id: 'f', label: 'Food', category: 'food', annualAmountPresentDollars: 12_000 },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.annualExpenses).toBe(42_000)
    expect(result.data.baselineExpenses).toHaveLength(2)
  })

  it('rejects an invalid expense category', () => {
    const result = SimulationInputsSchema.safeParse({
      ...defaultInputs(),
      baselineExpenses: [{ id: 'x', label: 'Mystery', category: 'spaceship', annualAmountPresentDollars: 1_000 }],
    })
    expect(result.success).toBe(false)
  })
})

describe('defaultInputs', () => {
  it('returns a valid SimulationInputs', () => {
    const inputs = defaultInputs()
    expect(inputs.person.currentAge).toBe(32)
    expect(inputs.person.maxAge).toBe(95)
    expect(inputs.initialStockGrowthMin).toBe(0.04)
    expect(inputs.initialStockGrowthMax).toBe(0.10)
    expect(inputs.initialInflationMin).toBe(0.02)
    expect(inputs.initialInflationMax).toBe(0.04)
    expect(inputs.withdrawalStrategy).toBe(WithdrawalStrategy.TaxOptimal)
  })

  it('defaults retirementAge to 62', () => {
    expect(defaultInputs().person.retirementAge).toBe(62)
  })

  it('defaults scenarioName to "Baseline plan"', () => {
    const inputs = defaultInputs()
    expect(inputs.scenarioName).toBe('Baseline plan')
  })
})

describe('SimulationInputsSchema scenarioName', () => {
  it('accepts a custom scenario name', () => {
    const result = SimulationInputsSchema.safeParse({
      ...defaultInputs(),
      scenarioName: 'Retire at 60',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty scenario name', () => {
    const result = SimulationInputsSchema.safeParse({
      ...defaultInputs(),
      scenarioName: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a scenario name longer than 80 chars', () => {
    const result = SimulationInputsSchema.safeParse({
      ...defaultInputs(),
      scenarioName: 'x'.repeat(81),
    })
    expect(result.success).toBe(false)
  })
})
