import { describe, it, expect } from 'vitest'
import { sumExpenseItems, scaleExpenseItems, createExpenseItem, isEssentialExpense, sumEssentialExpenses } from './expenses'
import type { ExpenseItem } from '../schema'

function item(amount: number, over: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: over.id ?? 'x',
    label: over.label ?? 'Item',
    category: over.category ?? 'other',
    annualAmountPresentDollars: amount,
    ...(over.essential !== undefined && { essential: over.essential }),
  }
}

describe('sumExpenseItems', () => {
  it('totals the line items', () => {
    expect(sumExpenseItems([item(30_000), item(12_000), item(8_000)])).toBe(50_000)
  })
  it('is 0 for an empty list', () => {
    expect(sumExpenseItems([])).toBe(0)
  })
})

describe('createExpenseItem', () => {
  it('fills sensible defaults and a unique id', () => {
    const a = createExpenseItem()
    const b = createExpenseItem()
    expect(a.id).not.toBe(b.id)
    expect(a.category).toBe('other')
    expect(a.annualAmountPresentDollars).toBe(0)
  })
  it('honors provided fields', () => {
    const it_ = createExpenseItem({ id: 'k', label: 'Healthcare', category: 'healthcare', annualAmountPresentDollars: 9_000 })
    expect(it_).toEqual({ id: 'k', label: 'Healthcare', category: 'healthcare', annualAmountPresentDollars: 9_000 })
  })
})

describe('isEssentialExpense', () => {
  it('defaults needs-type categories to essential', () => {
    for (const category of ['housing', 'healthcare', 'food', 'transportation', 'insurance', 'taxes'] as const) {
      expect(isEssentialExpense(item(1_000, { category }))).toBe(true)
    }
  })

  it('defaults discretionary and the "other" catch-all to non-essential', () => {
    expect(isEssentialExpense(item(1_000, { category: 'discretionary' }))).toBe(false)
    expect(isEssentialExpense(item(1_000, { category: 'other' }))).toBe(false)
  })

  it('an explicit per-item flag overrides the category default in both directions', () => {
    expect(isEssentialExpense(item(1_000, { category: 'other', essential: true }))).toBe(true)
    expect(isEssentialExpense(item(1_000, { category: 'healthcare', essential: false }))).toBe(false)
  })
})

describe('sumEssentialExpenses', () => {
  it('totals only the items that are effectively essential', () => {
    const items = [
      item(30_000, { id: 'a', category: 'housing' }), // essential by default
      item(20_000, { id: 'b', category: 'other' }), // non-essential by default
      item(10_000, { id: 'c', category: 'discretionary', essential: true }), // explicit override
      item(5_000, { id: 'd', category: 'food', essential: false }), // explicit override
    ]
    expect(sumEssentialExpenses(items)).toBe(40_000)
  })

  it('is 0 for an empty list', () => {
    expect(sumEssentialExpenses([])).toBe(0)
  })
})

describe('scaleExpenseItems', () => {
  it('scales items proportionally toward a new total', () => {
    const out = scaleExpenseItems([item(30_000, { id: 'a' }), item(10_000, { id: 'b' })], 80_000)
    expect(out.map((i) => i.annualAmountPresentDollars)).toEqual([60_000, 20_000])
    // ids/labels/categories preserved
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })
  it('holds essential items fixed and routes the change to discretionary spend', () => {
    // Essentials are the guardrails floor — changing the target spend must not
    // move them, only the discretionary buffer absorbs the difference.
    const items = [
      item(30_000, { id: 'a', category: 'housing' }), // essential
      item(40_000, { id: 'b', category: 'other' }), // discretionary
    ]
    const out = scaleExpenseItems(items, 100_000)
    expect(out.map((i) => i.annualAmountPresentDollars)).toEqual([30_000, 70_000])
    expect(sumEssentialExpenses(out)).toBe(30_000) // floor unchanged
  })
  it('scales multiple discretionary items proportionally while essentials stay fixed', () => {
    const items = [
      item(30_000, { id: 'a', category: 'housing' }), // essential
      item(30_000, { id: 'b', category: 'other' }), // discretionary
      item(10_000, { id: 'c', category: 'discretionary' }), // discretionary
    ]
    // target 110k → 80k discretionary spread over 30k:10k → 60k:20k
    const out = scaleExpenseItems(items, 110_000)
    expect(out.map((i) => i.annualAmountPresentDollars)).toEqual([30_000, 60_000, 20_000])
  })
  it('scales essentials down and zeros discretionary when target falls below the essential floor', () => {
    const items = [
      item(30_000, { id: 'a', category: 'housing' }), // essential
      item(40_000, { id: 'b', category: 'other' }), // discretionary
    ]
    const out = scaleExpenseItems(items, 20_000)
    expect(out.map((i) => i.annualAmountPresentDollars)).toEqual([20_000, 0])
    expect(sumExpenseItems(out)).toBe(20_000)
  })
  it('falls back to scaling essentials when there is no discretionary bucket', () => {
    const items = [
      item(30_000, { id: 'a', category: 'housing' }),
      item(10_000, { id: 'b', category: 'food' }),
    ]
    const out = scaleExpenseItems(items, 80_000)
    expect(out.map((i) => i.annualAmountPresentDollars)).toEqual([60_000, 20_000])
  })
  it('puts the whole change on the first discretionary item when discretionary spend is zero', () => {
    const items = [
      item(30_000, { id: 'a', category: 'housing' }), // essential
      item(0, { id: 'b', category: 'other' }), // discretionary, currently zero
      item(0, { id: 'c', category: 'discretionary' }), // discretionary, currently zero
    ]
    const out = scaleExpenseItems(items, 50_000)
    expect(out.map((i) => i.annualAmountPresentDollars)).toEqual([30_000, 20_000, 0])
  })
  it('puts the whole target on the first item when current total is zero', () => {
    const out = scaleExpenseItems([item(0, { id: 'a' }), item(0, { id: 'b' })], 50_000)
    expect(out.map((i) => i.annualAmountPresentDollars)).toEqual([50_000, 0])
  })
  it('synthesizes a general item when there are no items', () => {
    const out = scaleExpenseItems([], 40_000)
    expect(out).toHaveLength(1)
    expect(out[0].annualAmountPresentDollars).toBe(40_000)
  })
  it('never produces a negative total', () => {
    const out = scaleExpenseItems([item(10_000)], -5_000)
    expect(sumExpenseItems(out)).toBe(0)
  })
})
