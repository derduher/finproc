import { describe, it, expect } from 'vitest'
import { suggestedExpenses, EXPENSE_SUGGESTIONS } from './expenseSuggestions'
import { defaultInputs, EXPENSE_CATEGORIES } from '../schema'
import type { ExpenseItem } from '../schema'

function withExpenses(items: ExpenseItem[], over: Partial<ReturnType<typeof defaultInputs>> = {}) {
  return { ...defaultInputs(), baselineExpenses: items, ...over }
}

describe('EXPENSE_SUGGESTIONS catalog', () => {
  it('every entry has a valid category and a positive amount', () => {
    for (const s of EXPENSE_SUGGESTIONS) {
      expect(EXPENSE_CATEGORIES).toContain(s.category)
      expect(s.annualAmountPresentDollars).toBeGreaterThan(0)
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.blurb.length).toBeGreaterThan(0)
    }
  })

  it('has unique keys', () => {
    const keys = EXPENSE_SUGGESTIONS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('suggestedExpenses', () => {
  it('suggests the pre-Medicare healthcare bridge when retiring before 65', () => {
    const inputs = { ...defaultInputs(), person: { ...defaultInputs().person, retirementAge: 60 } }
    expect(suggestedExpenses(inputs).some((s) => s.key === 'healthcare-bridge')).toBe(true)
  })

  it('omits the healthcare bridge when retiring at or after 65', () => {
    const inputs = { ...defaultInputs(), person: { ...defaultInputs().person, retirementAge: 67 } }
    expect(suggestedExpenses(inputs).some((s) => s.key === 'healthcare-bridge')).toBe(false)
  })

  it('omits a suggestion already present in the breakdown (by label)', () => {
    const propertyTax = EXPENSE_SUGGESTIONS.find((s) => s.key === 'property-tax')!
    const inputs = withExpenses([
      { id: 'g', label: 'General living', category: 'other', annualAmountPresentDollars: 50_000 },
      { id: 'p', label: propertyTax.label, category: 'taxes', annualAmountPresentDollars: 6_000 },
    ])
    expect(suggestedExpenses(inputs).some((s) => s.key === 'property-tax')).toBe(false)
  })

  it('returns plain suggestion objects (no predicate leaking through)', () => {
    const s = suggestedExpenses(defaultInputs())[0]
    expect(Object.keys(s).sort()).toEqual(['annualAmountPresentDollars', 'blurb', 'category', 'key', 'label'])
  })
})
