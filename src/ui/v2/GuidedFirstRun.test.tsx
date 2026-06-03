import { describe, it, expect } from 'vitest'
import { buildFirstRunInputs } from './GuidedFirstRun'
import { SimulationInputsSchema } from '../../schema'

describe('buildFirstRunInputs', () => {
  const answers = { currentAge: 42, retireAge: 65, saved: 340_000, addingMonthly: 2_540, targetSpend: 80_000 }

  it('produces a schema-valid plan', () => {
    const inputs = buildFirstRunInputs(answers)
    expect(() => SimulationInputsSchema.parse(inputs)).not.toThrow()
  })

  it('seeds a 401(k) with the saved balance and annualised contributions', () => {
    const inputs = buildFirstRunInputs(answers)
    expect(inputs.accounts).toHaveLength(1)
    const acct = inputs.accounts[0]
    expect(acct.type).toBe('traditional')
    expect(acct.balance).toBe(340_000)
    expect(acct.contributionAmount * 12).toBeCloseTo(2_540 * 12, 0)
    expect(acct.contributionEndAge).toBe(65)
    expect(acct.withdrawalStartAge).toBe(65)
  })

  it('carries the target spend, ages, and default Social Security', () => {
    const inputs = buildFirstRunInputs(answers)
    expect(inputs.annualExpenses).toBe(80_000)
    expect(inputs.person.currentAge).toBe(42)
    expect(inputs.person.retirementAge).toBe(65)
    expect(inputs.person.maxAge).toBe(95)
    expect(inputs.socialSecurity?.claimAge).toBe(67)
  })

  it('sets salary high enough to cover spend + contributions after tax', () => {
    const inputs = buildFirstRunInputs(answers)
    const afterTax = inputs.person.annualSalary * (1 - inputs.person.marginalTaxRate)
    expect(afterTax).toBeGreaterThanOrEqual(80_000 + 2_540 * 12 - 1)
  })
})
