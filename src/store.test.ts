import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useStore } from './store'
import { defaultInputs } from './schema'

// Reset store state before each test
beforeEach(() => {
  useStore.setState({
    inputs: defaultInputs(),
    ui: {
      activeStep: 0,
      displayMode: 'nominal',
    },
  })
})

describe('useStore — input mutations', () => {
  it('setInputs replaces inputs', () => {
    const { result } = renderHook(() => useStore())
    const newInputs = { ...defaultInputs(), annualExpenses: 99000 }
    act(() => {
      result.current.setInputs(newInputs)
    })
    expect(result.current.inputs.annualExpenses).toBe(99000)
  })

  it('patchInputs deep-merges', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.patchInputs({ annualExpenses: 55000 })
    })
    expect(result.current.inputs.annualExpenses).toBe(55000)
    // Other fields preserved
    expect(result.current.inputs.person.currentAge).toBe(defaultInputs().person.currentAge)
  })

  it('patchPerson updates person while preserving other inputs', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.patchPerson({ currentAge: 50 })
    })
    expect(result.current.inputs.person.currentAge).toBe(50)
    expect(result.current.inputs.annualExpenses).toBe(defaultInputs().annualExpenses)
  })
})

describe('useStore — UI state', () => {
  it('setActiveStep updates the active step', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.setActiveStep(3)
    })
    expect(result.current.ui.activeStep).toBe(3)
  })

  it('setDisplayMode toggles nominal/real', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.setDisplayMode('real')
    })
    expect(result.current.ui.displayMode).toBe('real')
    act(() => {
      result.current.setDisplayMode('nominal')
    })
    expect(result.current.ui.displayMode).toBe('nominal')
  })
})
