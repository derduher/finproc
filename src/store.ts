import { create } from 'zustand'
import { defaultInputs } from './schema'
import { withRetirementAge } from './sim/retirementAge'
import { sumExpenseItems, scaleExpenseItems } from './sim/expenses'
import type { SimulationInputs, Person, ExpenseItem } from './schema'

export type DisplayMode = 'nominal' | 'real'
export type Aesthetic = 'warm' | 'cool' | 'mono'
export type Theme = 'light' | 'dark'
export type Density = 'compact' | 'comfortable'

/** The three first-run defaults the user alone can firm up. See `sim/guesses.ts`. */
export type GuessId = 'ss' | 'match' | 'mix'

/**
 * Session-only guess-check state for the post-splash first run. Not persisted to
 * the URL: a shared, complete plan must land on the full screen, not nag with a
 * rough range. `active` flips true only when this session built the plan via the
 * guided splash; returning via URL leaves it false.
 */
export interface FirstRunState {
  active: boolean
  checked: Record<GuessId, boolean>
  bannerDismissed: boolean
}

/** A pristine first-run state — inactive, nothing checked or dismissed. */
export function initialFirstRun(): FirstRunState {
  return { active: false, checked: { ss: false, match: false, mix: false }, bannerDismissed: false }
}

/** 'normal' (no first-run overlay) · 'rough' (range hero + guess-check) · 'confirmed'. */
export function deriveFirstRunPhase(fr: FirstRunState): 'normal' | 'rough' | 'confirmed' {
  if (!fr.active) return 'normal'
  return fr.checked.ss && fr.checked.match && fr.checked.mix ? 'confirmed' : 'rough'
}

export interface UiState {
  /** Whether to display values in nominal or real (inflation-adjusted) dollars */
  displayMode: DisplayMode
  /** Visual aesthetic (warm editorial / cool trust / mono quant) */
  aesthetic: Aesthetic
  /** Light or dark theme */
  theme: Theme
  /** Spacing density */
  density: Density
  /** ms timestamp of the last successful URL commit (used for "auto-saved Ns ago") */
  lastCommittedAt: number | null
  /** Post-splash guess-check progress (session-only). */
  firstRun: FirstRunState
}

export interface Store {
  inputs: SimulationInputs
  ui: UiState

  /** Replace all inputs */
  setInputs: (inputs: SimulationInputs) => void
  /** Shallow-merge top-level input fields */
  patchInputs: (patch: Partial<SimulationInputs>) => void
  /** Shallow-merge person fields */
  patchPerson: (patch: Partial<Person>) => void

  /** Replace the itemized baseline expenses, keeping `annualExpenses` synced to the sum. */
  setBaselineExpenses: (items: ExpenseItem[]) => void
  /** Edit the aggregate spend; scales the breakdown proportionally to match. */
  setExpensesTotal: (total: number) => void

  setDisplayMode: (mode: DisplayMode) => void
  setAesthetic: (aesthetic: Aesthetic) => void
  setTheme: (theme: Theme) => void
  setDensity: (density: Density) => void
  setLastCommittedAt: (ts: number) => void

  /** Begin the post-splash guess-check (resets prior progress). */
  startFirstRun: () => void
  /** Mark one guess as the user's own figure. */
  confirmGuess: (id: GuessId) => void
  /** Dismiss the first-run welcome banner. */
  dismissFirstRunBanner: () => void
}

export const useStore = create<Store>((set) => ({
  inputs: defaultInputs(),
  ui: {
    displayMode: 'nominal',
    aesthetic: 'warm',
    theme: 'light',
    density: 'comfortable',
    lastCommittedAt: null,
    firstRun: initialFirstRun(),
  },

  setInputs: (inputs) => set({ inputs }),

  patchInputs: (patch) =>
    set((s) => ({ inputs: { ...s.inputs, ...patch } })),

  patchPerson: (patch) =>
    set((s) => {
      const person = { ...s.inputs.person, ...patch }
      // When retirementAge changes, cascade it onto accounts (contributions stop
      // at retirement; taxable accounts begin drawing then). See withRetirementAge.
      if (patch.retirementAge !== undefined && patch.retirementAge !== s.inputs.person.retirementAge) {
        return { inputs: withRetirementAge({ ...s.inputs, person }, patch.retirementAge) }
      }
      return { inputs: { ...s.inputs, person } }
    }),

  setBaselineExpenses: (items) =>
    set((s) => ({ inputs: { ...s.inputs, baselineExpenses: items, annualExpenses: sumExpenseItems(items) } })),

  setExpensesTotal: (total) =>
    set((s) => {
      const items = scaleExpenseItems(s.inputs.baselineExpenses, total)
      return { inputs: { ...s.inputs, baselineExpenses: items, annualExpenses: sumExpenseItems(items) } }
    }),


  setDisplayMode: (displayMode) => set((s) => ({ ui: { ...s.ui, displayMode } })),

  setAesthetic: (aesthetic) => set((s) => ({ ui: { ...s.ui, aesthetic } })),

  setTheme: (theme) => set((s) => ({ ui: { ...s.ui, theme } })),

  setDensity: (density) => set((s) => ({ ui: { ...s.ui, density } })),

  setLastCommittedAt: (lastCommittedAt) => set((s) => ({ ui: { ...s.ui, lastCommittedAt } })),

  startFirstRun: () => set((s) => ({ ui: { ...s.ui, firstRun: { ...initialFirstRun(), active: true } } })),

  confirmGuess: (id) =>
    set((s) => ({ ui: { ...s.ui, firstRun: { ...s.ui.firstRun, checked: { ...s.ui.firstRun.checked, [id]: true } } } })),

  dismissFirstRunBanner: () =>
    set((s) => ({ ui: { ...s.ui, firstRun: { ...s.ui.firstRun, bannerDismissed: true } } })),
}))
