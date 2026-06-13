/**
 * Baseline-expense helpers — pure operations over the itemized `baselineExpenses`
 * breakdown. The aggregate `annualExpenses` the simulation consumes is always the
 * sum of these items (enforced by the schema transform + store actions), so these
 * helpers are the single place that math lives.
 */
import type { ExpenseCategory, ExpenseItem } from '../schema'

export const GENERAL_EXPENSE_LABEL = 'General living'

/** Total annual baseline spend (today's $) across all line items. */
export function sumExpenseItems(items: ExpenseItem[]): number {
  return items.reduce((sum, it) => sum + it.annualAmountPresentDollars, 0)
}

/**
 * Categories that default to essential when an item carries no explicit
 * `essential` flag. Needs-type buckets are non-negotiable; `discretionary` is
 * cuttable by definition, and the `other` catch-all (where the default
 * "General living" item lives) stays cuttable so legacy plans keep the
 * pre-floor guardrails behavior until the user says otherwise.
 */
const DEFAULT_ESSENTIAL_CATEGORIES: ReadonlySet<ExpenseCategory> = new Set([
  'housing',
  'healthcare',
  'food',
  'transportation',
  'insurance',
  'taxes',
])

/** Whether an item counts toward the guardrails spending floor: the explicit per-item flag wins, else the category default. */
export function isEssentialExpense(item: ExpenseItem): boolean {
  return item.essential ?? DEFAULT_ESSENTIAL_CATEGORIES.has(item.category)
}

/** Annual essential spend (today's $) — the guardrails floor in dollars. */
export function sumEssentialExpenses(items: ExpenseItem[]): number {
  return items.reduce((sum, it) => sum + (isEssentialExpense(it) ? it.annualAmountPresentDollars : 0), 0)
}

/** Build a line item with sensible defaults; pass `id` in tests for determinism. */
export function createExpenseItem(partial: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: partial.id ?? crypto.randomUUID(),
    label: partial.label ?? 'New expense',
    category: partial.category ?? 'other',
    annualAmountPresentDollars: partial.annualAmountPresentDollars ?? 0,
    ...(partial.essential !== undefined && { essential: partial.essential }),
  }
}

/**
 * Scale the breakdown toward a new aggregate total, preserving each item's share.
 * Used by the quick "target spend" lever so editing the aggregate keeps the
 * itemized view consistent. Edge cases: empty list synthesizes one general item;
 * an all-zero list (no shares to preserve) puts the whole target on the first item.
 */
export function scaleExpenseItems(items: ExpenseItem[], newTotal: number): ExpenseItem[] {
  const target = Math.max(0, newTotal)
  if (items.length === 0) {
    return [createExpenseItem({ label: GENERAL_EXPENSE_LABEL, annualAmountPresentDollars: target })]
  }
  const current = sumExpenseItems(items)
  if (current <= 0) {
    return items.map((it, i) => ({ ...it, annualAmountPresentDollars: i === 0 ? target : 0 }))
  }
  return items.map((it) => ({
    ...it,
    annualAmountPresentDollars: Math.round((it.annualAmountPresentDollars * target) / current),
  }))
}
