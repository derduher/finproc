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
      aesthetic: 'warm',
      theme: 'light',
      density: 'comfortable',
      lastCommittedAt: null,
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

describe('useStore — aesthetic / theme / density', () => {
  it('defaults to warm / light / comfortable', () => {
    const { result } = renderHook(() => useStore())
    expect(result.current.ui.aesthetic).toBe('warm')
    expect(result.current.ui.theme).toBe('light')
    expect(result.current.ui.density).toBe('comfortable')
  })

  it('setAesthetic updates the aesthetic', () => {
    const { result } = renderHook(() => useStore())
    act(() => { result.current.setAesthetic('cool') })
    expect(result.current.ui.aesthetic).toBe('cool')
    act(() => { result.current.setAesthetic('mono') })
    expect(result.current.ui.aesthetic).toBe('mono')
  })

  it('setTheme toggles light/dark', () => {
    const { result } = renderHook(() => useStore())
    act(() => { result.current.setTheme('dark') })
    expect(result.current.ui.theme).toBe('dark')
  })

  it('setDensity toggles compact/comfortable', () => {
    const { result } = renderHook(() => useStore())
    act(() => { result.current.setDensity('compact') })
    expect(result.current.ui.density).toBe('compact')
  })

  it('preserves other UI state when setting aesthetic', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.setActiveStep(3)
      result.current.setAesthetic('cool')
    })
    expect(result.current.ui.activeStep).toBe(3)
    expect(result.current.ui.aesthetic).toBe('cool')
  })
})

describe('useStore — lastCommittedAt', () => {
  it('defaults to null', () => {
    const { result } = renderHook(() => useStore())
    expect(result.current.ui.lastCommittedAt).toBeNull()
  })

  it('setLastCommittedAt stores a timestamp', () => {
    const { result } = renderHook(() => useStore())
    act(() => { result.current.setLastCommittedAt(1700000000000) })
    expect(result.current.ui.lastCommittedAt).toBe(1700000000000)
  })
})
