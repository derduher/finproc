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
})
