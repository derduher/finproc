import { describe, it, expect } from 'vitest'
import { buildFirstRunInputs } from './GuidedFirstRun'
import { SimulationInputsSchema } from '../../schema'

describe('buildFirstRunInputs', () => {
  const answers = { currentAge: 42, retireAge: 65, saved: 340_000, addingMonthly: 2_540, targetSpend: 80_000 }

  it('produces a schema-valid plan', () => {
    const inputs = buildFirstRunInputs(answers)
    expect(() => SimulationInputsSchema.parse(inputs)).not.toThrow()
  })

  it('splits the saved balance across a 401(k), IRA, and taxable mix that sums to the total', () => {
    const inputs = buildFirstRunInputs(answers)
    expect(inputs.accounts).toHaveLength(3)
    const subtypes = inputs.accounts.map((a) => a.accountSubtype ?? a.type)
    expect(subtypes).toContain('401k')
    expect(subtypes).toContain('ira')
    expect(inputs.accounts.some((a) => a.type === 'taxable')).toBe(true)
    expect(inputs.accounts.reduce((s, a) => s + a.balance, 0)).toBe(340_000)
    // The 401(k) holds the most, matching the design's $250k/$60k/$30k shape.
    const k401 = inputs.accounts.find((a) => a.accountSubtype === '401k')!
    expect(k401.balance).toBeGreaterThan(inputs.accounts.find((a) => a.accountSubtype === 'ira')!.balance)
  })

  it('puts the monthly additions and a flat employer match on the 401(k)', () => {
    const inputs = buildFirstRunInputs(answers)
    const k401 = inputs.accounts.find((a) => a.accountSubtype === '401k')!
    expect(k401.type).toBe('traditional')
    expect(k401.contributionAmount * 12).toBeCloseTo(2_540 * 12, 0)
    expect(k401.contributionEndAge).toBe(65)
    expect(k401.withdrawalStartAge).toBe(65)
    expect(k401.employerMatch).toEqual({ type: 'flat', annualAmount: 6_000 })
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
