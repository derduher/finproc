import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUrlSync } from './useUrlSync'
import { defaultInputs } from '../schema'

describe('useUrlSync', () => {
  beforeEach(() => {
    // Reset URL to clean state
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reads initial state from URL on mount (empty → null)', () => {
    const { result } = renderHook(() => useUrlSync())
    expect(result.current.initialInputs).toBeNull()
  })

  it('debounces URL writes by 500ms', async () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    const { result } = renderHook(() => useUrlSync())

    act(() => {
      result.current.syncToUrl(defaultInputs())
    })

    // Should NOT have written immediately
    expect(pushStateSpy).not.toHaveBeenCalled()

    // After 500ms → should write
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(pushStateSpy).toHaveBeenCalledTimes(1)
  })

  it('cancels pending write on unmount', async () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    const { result, unmount } = renderHook(() => useUrlSync())

    act(() => {
      result.current.syncToUrl(defaultInputs())
    })

    unmount()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Should NOT have written (unmounted before debounce fired)
    expect(pushStateSpy).not.toHaveBeenCalled()
  })

  it('includes a ?ui= param when prefs are passed', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    const { result } = renderHook(() => useUrlSync())

    act(() => {
      result.current.syncToUrl(defaultInputs(), { aesthetic: 'cool', theme: 'dark', density: 'compact' })
    })
    act(() => { vi.advanceTimersByTime(500) })

    expect(pushStateSpy).toHaveBeenCalledTimes(1)
    const url = pushStateSpy.mock.calls[0][2] as string
    expect(url).toContain('ui=')
    expect(url).toContain('s=')
  })

  it('invokes onCommit after the debounced write fires', () => {
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    const onCommit = vi.fn()
    const { result } = renderHook(() => useUrlSync())

    act(() => { result.current.syncToUrl(defaultInputs(), undefined, onCommit) })
    expect(onCommit).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(500) })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('exposes initialUiPrefs from ?ui= param', async () => {
    const { compressUiPrefs } = await import('../storage/urlState')
    const encoded = compressUiPrefs({ aesthetic: 'mono', theme: 'dark', density: 'compact' })
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: `?ui=${encoded}` },
      writable: true,
    })

    const { result } = renderHook(() => useUrlSync())
    expect(result.current.initialUiPrefs).toEqual({ aesthetic: 'mono', theme: 'dark', density: 'compact' })
  })
})
