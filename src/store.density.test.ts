/**
 * Phase 6: density state round-trips through URL and Frame sets data-density on root.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore, initialFirstRun } from './store'

beforeEach(() => {
  useStore.setState({
    inputs: useStore.getState().inputs,
    ui: {
      displayMode: 'nominal',
      aesthetic: 'warm',
      theme: 'light',
      density: 'comfortable',
      lastCommittedAt: null,
      firstRun: initialFirstRun(),
    },
  })
})

describe('density state', () => {
  it('defaults to comfortable', () => {
    expect(useStore.getState().ui.density).toBe('comfortable')
  })

  it('setDensity updates state', () => {
    useStore.getState().setDensity('compact')
    expect(useStore.getState().ui.density).toBe('compact')
  })

  it('setDensity back to comfortable', () => {
    useStore.getState().setDensity('compact')
    useStore.getState().setDensity('comfortable')
    expect(useStore.getState().ui.density).toBe('comfortable')
  })
})
