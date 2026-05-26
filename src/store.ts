import { create } from 'zustand'
import { defaultInputs } from './schema'
import type { SimulationInputs, Person } from './schema'

export type DisplayMode = 'nominal' | 'real'
export type Aesthetic = 'warm' | 'cool' | 'mono'
export type Theme = 'light' | 'dark'
export type Density = 'compact' | 'comfortable'

export interface UiState {
  /** Current wizard step index (0–5) */
  activeStep: number
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

  setActiveStep: (step: number) => void
  setDisplayMode: (mode: DisplayMode) => void
  setAesthetic: (aesthetic: Aesthetic) => void
  setTheme: (theme: Theme) => void
  setDensity: (density: Density) => void
  setLastCommittedAt: (ts: number) => void
}

export const useStore = create<Store>((set) => ({
  inputs: defaultInputs(),
  ui: {
    activeStep: 0,
    displayMode: 'nominal',
    aesthetic: 'warm',
    theme: 'light',
    density: 'comfortable',
    lastCommittedAt: null,
  },

  setInputs: (inputs) => set({ inputs }),

  patchInputs: (patch) =>
    set((s) => ({ inputs: { ...s.inputs, ...patch } })),

  patchPerson: (patch) =>
    set((s) => ({ inputs: { ...s.inputs, person: { ...s.inputs.person, ...patch } } })),

  setActiveStep: (activeStep) => set((s) => ({ ui: { ...s.ui, activeStep } })),

  setDisplayMode: (displayMode) => set((s) => ({ ui: { ...s.ui, displayMode } })),

  setAesthetic: (aesthetic) => set((s) => ({ ui: { ...s.ui, aesthetic } })),

  setTheme: (theme) => set((s) => ({ ui: { ...s.ui, theme } })),

  setDensity: (density) => set((s) => ({ ui: { ...s.ui, density } })),

  setLastCommittedAt: (lastCommittedAt) => set((s) => ({ ui: { ...s.ui, lastCommittedAt } })),
}))
