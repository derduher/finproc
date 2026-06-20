/**
 * confidenceTarget — the explorer's confidence slider value (a success-rate
 * target in [0,1]) lives in UI state so the headline solvers re-run when it
 * changes. Session-only (not URL-persisted): it's a momentary exploration knob.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore, initialUiState } from './store'

beforeEach(() => {
  useStore.setState({ ui: initialUiState() })
})

describe('confidenceTarget state', () => {
  it('defaults to 0.9', () => {
    expect(useStore.getState().ui.confidenceTarget).toBe(0.9)
  })

  it('setConfidenceTarget updates state', () => {
    useStore.getState().setConfidenceTarget(0.95)
    expect(useStore.getState().ui.confidenceTarget).toBe(0.95)
  })

  it('clamps to [0.5, 0.999]', () => {
    useStore.getState().setConfidenceTarget(2)
    expect(useStore.getState().ui.confidenceTarget).toBe(0.999)
    useStore.getState().setConfidenceTarget(0)
    expect(useStore.getState().ui.confidenceTarget).toBe(0.5)
  })
})
