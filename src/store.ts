import { create } from 'zustand'
import { defaultInputs } from './schema'
import type { SimulationInputs, Person } from './schema'

export type DisplayMode = 'nominal' | 'real'

export interface UiState {
  /** Current wizard step index (0–5) */
  activeStep: number
  /** Whether to display values in nominal or real (inflation-adjusted) dollars */
  displayMode: DisplayMode
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
}

export const useStore = create<Store>((set) => ({
  inputs: defaultInputs(),
  ui: {
    activeStep: 0,
    displayMode: 'nominal',
  },

  setInputs: (inputs) => set({ inputs }),

  patchInputs: (patch) =>
    set((s) => ({ inputs: { ...s.inputs, ...patch } })),

  patchPerson: (patch) =>
    set((s) => ({ inputs: { ...s.inputs, person: { ...s.inputs.person, ...patch } } })),

  setActiveStep: (activeStep) => set((s) => ({ ui: { ...s.ui, activeStep } })),

  setDisplayMode: (displayMode) => set((s) => ({ ui: { ...s.ui, displayMode } })),
}))
