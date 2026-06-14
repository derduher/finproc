import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useStore, deriveFirstRunPhase, initialFirstRun } from './store'
import { defaultInputs } from './schema'

// Reset store state before each test
beforeEach(() => {
  useStore.setState({
    inputs: defaultInputs(),
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

  it('setBaselineExpenses keeps annualExpenses synced to the item sum', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.setBaselineExpenses([
        { id: 'h', label: 'Housing', category: 'housing', annualAmountPresentDollars: 30_000 },
        { id: 'f', label: 'Food', category: 'food', annualAmountPresentDollars: 15_000 },
      ])
    })
    expect(result.current.inputs.baselineExpenses).toHaveLength(2)
    expect(result.current.inputs.annualExpenses).toBe(45_000)
  })

  it('setExpensesTotal scales the breakdown proportionally and re-syncs the aggregate', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.setBaselineExpenses([
        { id: 'a', label: 'A', category: 'other', annualAmountPresentDollars: 30_000 },
        { id: 'b', label: 'B', category: 'other', annualAmountPresentDollars: 10_000 },
      ])
    })
    act(() => {
      result.current.setExpensesTotal(80_000)
    })
    expect(result.current.inputs.annualExpenses).toBe(80_000)
    expect(result.current.inputs.baselineExpenses.map((i) => i.annualAmountPresentDollars)).toEqual([60_000, 20_000])
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

describe('useStore — first-run guess-check', () => {
  it('starts inactive with no guesses checked', () => {
    const { result } = renderHook(() => useStore())
    expect(result.current.ui.firstRun.active).toBe(false)
    expect(result.current.ui.firstRun.checked).toEqual({ ss: false, match: false, mix: false })
    expect(result.current.ui.firstRun.bannerDismissed).toBe(false)
  })

  it('startFirstRun activates the flow and clears prior progress', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.confirmGuess('ss')
      result.current.dismissFirstRunBanner()
    })
    act(() => {
      result.current.startFirstRun()
    })
    expect(result.current.ui.firstRun.active).toBe(true)
    expect(result.current.ui.firstRun.checked).toEqual({ ss: false, match: false, mix: false })
    expect(result.current.ui.firstRun.bannerDismissed).toBe(false)
  })

  it('confirmGuess marks a single guess checked', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.confirmGuess('match')
    })
    expect(result.current.ui.firstRun.checked).toEqual({ ss: false, match: true, mix: false })
  })

  it('dismissFirstRunBanner hides the banner', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.dismissFirstRunBanner()
    })
    expect(result.current.ui.firstRun.bannerDismissed).toBe(true)
  })
})

describe('deriveFirstRunPhase', () => {
  it('is "normal" when the flow is inactive', () => {
    expect(deriveFirstRunPhase({ active: false, checked: { ss: false, match: false, mix: false }, bannerDismissed: false })).toBe('normal')
  })

  it('is "rough" when active with any unchecked guess', () => {
    expect(deriveFirstRunPhase({ active: true, checked: { ss: true, match: false, mix: true }, bannerDismissed: false })).toBe('rough')
  })

  it('is "confirmed" when active and all three are checked', () => {
    expect(deriveFirstRunPhase({ active: true, checked: { ss: true, match: true, mix: true }, bannerDismissed: false })).toBe('confirmed')
  })
})

describe('useStore — retirement-age cascade', () => {
  it('changing retirementAge updates contributionEndAge on all accounts to the new value', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.patchInputs({
        accounts: [
          {
            id: 'a', name: 'Roth', type: 'roth',
            balance: 100_000,
            contributionAmount: 500,
            contributionType: 'flat',
            contributionFrequency: 'monthly',
            contributionEndAge: 62,
            withdrawalStartAge: 60,
          },
          {
            id: 'b', name: 'Brokerage', type: 'taxable',
            balance: 50_000,
            contributionAmount: 200,
            contributionType: 'flat',
            contributionFrequency: 'monthly',
            contributionEndAge: 62,
            withdrawalStartAge: 62,
          },
        ],
      })
      result.current.patchPerson({ retirementAge: 55 })
    })
    expect(result.current.inputs.accounts[0].contributionEndAge).toBe(55)
    expect(result.current.inputs.accounts[1].contributionEndAge).toBe(55)
  })

  it('changing retirementAge updates withdrawalStartAge on TAXABLE accounts only', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.patchInputs({
        accounts: [
          {
            id: 'a', name: 'Roth', type: 'roth',
            balance: 100_000,
            contributionAmount: 500,
            contributionType: 'flat',
            contributionFrequency: 'monthly',
            contributionEndAge: 62,
            withdrawalStartAge: 59, // legal IRS rule — should NOT move
          },
          {
            id: 'b', name: 'Brokerage', type: 'taxable',
            balance: 50_000,
            contributionAmount: 200,
            contributionType: 'flat',
            contributionFrequency: 'monthly',
            contributionEndAge: 62,
            withdrawalStartAge: 62,
          },
        ],
      })
      result.current.patchPerson({ retirementAge: 67 })
    })
    expect(result.current.inputs.accounts[0].withdrawalStartAge).toBe(59) // unchanged (IRS-bound)
    expect(result.current.inputs.accounts[1].withdrawalStartAge).toBe(67) // tracks retirement
  })

  it('patchPerson without retirementAge change leaves accounts untouched', () => {
    const { result } = renderHook(() => useStore())
    act(() => {
      result.current.patchInputs({
        accounts: [{
          id: 'a', name: 'Roth', type: 'roth',
          balance: 100_000,
          contributionAmount: 500,
          contributionType: 'flat',
          contributionFrequency: 'monthly',
          contributionEndAge: 62,
          withdrawalStartAge: 59,
        }],
      })
      result.current.patchPerson({ annualSalary: 120_000 })
    })
    expect(result.current.inputs.accounts[0].contributionEndAge).toBe(62)
    expect(result.current.inputs.accounts[0].withdrawalStartAge).toBe(59)
  })
})

describe('useStore — UI state', () => {
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
      result.current.setDisplayMode('real')
      result.current.setAesthetic('cool')
    })
    expect(result.current.ui.displayMode).toBe('real')
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
