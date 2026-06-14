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
 * Scale the breakdown toward a new aggregate total **without disturbing the
 * essential floor**. The quick "target spend" lever adjusts the discretionary
 * buffer only: essential items (the guardrails floor) stay fixed so changing
 * the target never moves what the floor protects. The difference is absorbed by
 * the discretionary items, scaled in proportion to their existing shares.
 *
 * Edge cases:
 *  - empty list → synthesize one general (discretionary) item at the target;
 *  - target below the essential sum → there's no room for the floor, so scale the
 *    essentials down to the target and zero the discretionary items;
 *  - no discretionary bucket at all → nothing else can absorb the change, so fall
 *    back to scaling the essentials proportionally;
 *  - discretionary present but currently zero → put the whole discretionary target
 *    on the first discretionary item.
 */
export function scaleExpenseItems(items: ExpenseItem[], newTotal: number): ExpenseItem[] {
  const target = Math.max(0, newTotal)
  if (items.length === 0) {
    return [createExpenseItem({ label: GENERAL_EXPENSE_LABEL, annualAmountPresentDollars: target })]
  }

  const essentialTotal = sumEssentialExpenses(items)
  const discretionaryTotal = sumExpenseItems(items) - essentialTotal
  const hasDiscretionary = items.some((it) => !isEssentialExpense(it))

  // Target can't even cover essentials (or there's nothing but essentials to
  // adjust): scale the essential items down to the target, zero the rest.
  if (target <= essentialTotal || !hasDiscretionary) {
    return scaleSubset(items, target, isEssentialExpense)
  }

  // Hold essentials fixed; the discretionary bucket absorbs the difference.
  const discretionaryTarget = target - essentialTotal
  if (discretionaryTotal <= 0) {
    let placed = false
    return items.map((it) => {
      if (isEssentialExpense(it)) return it
      const amount = placed ? 0 : discretionaryTarget
      placed = true
      return { ...it, annualAmountPresentDollars: amount }
    })
  }
  return items.map((it) =>
    isEssentialExpense(it)
      ? it
      : {
          ...it,
          annualAmountPresentDollars: Math.round(
            (it.annualAmountPresentDollars * discretionaryTarget) / discretionaryTotal,
          ),
        },
  )
}

/**
 * Scale just the items matching `pick` so their total hits `target`, zeroing the
 * rest. An all-zero matched subset puts the whole target on the first match.
 */
function scaleSubset(
  items: ExpenseItem[],
  target: number,
  pick: (it: ExpenseItem) => boolean,
): ExpenseItem[] {
  const current = items.reduce((sum, it) => sum + (pick(it) ? it.annualAmountPresentDollars : 0), 0)
  let placed = false
  return items.map((it) => {
    if (!pick(it)) return { ...it, annualAmountPresentDollars: 0 }
    if (current <= 0) {
      const amount = placed ? 0 : target
      placed = true
      return { ...it, annualAmountPresentDollars: amount }
    }
    return { ...it, annualAmountPresentDollars: Math.round((it.annualAmountPresentDollars * target) / current) }
  })
}
