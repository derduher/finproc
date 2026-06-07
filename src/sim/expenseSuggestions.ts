/**
 * Suggested baseline expenses — a small catalog of commonly-missed recurring
 * costs (healthcare bridges, property tax, home upkeep, etc.) plus a
 * context-aware filter. Pure: `suggestedExpenses(inputs)` returns the entries
 * that apply to this plan and aren't already in the breakdown, ready to be
 * one-click added as line items.
 */
import type { SimulationInputs, ExpenseCategory } from '../schema'

export interface ExpenseSuggestion {
  /** Stable identifier (not persisted; used for de-dupe + React keys). */
  key: string
  label: string
  category: ExpenseCategory
  annualAmountPresentDollars: number
  /** One-line rationale shown in the UI. */
  blurb: string
}

/** Catalog entry with an optional applicability predicate. */
interface CatalogEntry extends ExpenseSuggestion {
  applies?: (inputs: SimulationInputs) => boolean
}

const CATALOG: CatalogEntry[] = [
  {
    key: 'healthcare-bridge',
    label: 'Healthcare (pre-Medicare)',
    category: 'healthcare',
    annualAmountPresentDollars: 12_000,
    blurb: 'ACA premiums + out-of-pocket to bridge from early retirement to Medicare at 65.',
    applies: (i) => i.person.retirementAge < 65 && i.person.currentAge < 65,
  },
  {
    key: 'medicare',
    label: 'Medicare + supplements',
    category: 'healthcare',
    annualAmountPresentDollars: 7_000,
    blurb: 'Part B/D premiums, Medigap, and out-of-pocket costs from age 65 on.',
  },
  {
    key: 'property-tax',
    label: 'Property tax',
    category: 'taxes',
    annualAmountPresentDollars: 6_000,
    blurb: 'Annual property tax on your home — often missed in a single spending number.',
  },
  {
    key: 'home-maintenance',
    label: 'Home maintenance',
    category: 'housing',
    annualAmountPresentDollars: 4_000,
    blurb: 'Rule of thumb: ~1% of home value per year for repairs and upkeep.',
  },
  {
    key: 'long-term-care',
    label: 'Long-term care reserve',
    category: 'healthcare',
    annualAmountPresentDollars: 5_000,
    blurb: 'Set aside for in-home help or facility care later in life.',
  },
  {
    key: 'vehicle',
    label: 'Vehicle replacement',
    category: 'transportation',
    annualAmountPresentDollars: 5_000,
    blurb: 'Amortized cost of replacing a car roughly every 10 years.',
  },
]

/** The catalog as plain suggestions (predicates stripped), for display/testing. */
export const EXPENSE_SUGGESTIONS: ExpenseSuggestion[] = CATALOG.map(strip)

function strip(entry: CatalogEntry): ExpenseSuggestion {
  const { key, label, category, annualAmountPresentDollars, blurb } = entry
  return { key, label, category, annualAmountPresentDollars, blurb }
}

/** Context-aware suggestions: applicable to this plan and not already itemized. */
export function suggestedExpenses(inputs: SimulationInputs): ExpenseSuggestion[] {
  const present = new Set(inputs.baselineExpenses.map((it) => it.label.trim().toLowerCase()))
  return CATALOG.filter((entry) => {
    if (entry.applies && !entry.applies(inputs)) return false
    if (present.has(entry.label.toLowerCase())) return false
    return true
  }).map(strip)
}
