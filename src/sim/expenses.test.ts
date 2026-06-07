import { describe, it, expect } from 'vitest'
import { sumExpenseItems, scaleExpenseItems, createExpenseItem } from './expenses'
import type { ExpenseItem } from '../schema'

function item(amount: number, over: Partial<ExpenseItem> = {}): ExpenseItem {
  return { id: over.id ?? 'x', label: over.label ?? 'Item', category: over.category ?? 'other', annualAmountPresentDollars: amount }
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

describe('scaleExpenseItems', () => {
  it('scales items proportionally toward a new total', () => {
    const out = scaleExpenseItems([item(30_000, { id: 'a' }), item(10_000, { id: 'b' })], 80_000)
    expect(out.map((i) => i.annualAmountPresentDollars)).toEqual([60_000, 20_000])
    // ids/labels/categories preserved
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
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
