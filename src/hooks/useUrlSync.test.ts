import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUrlSync } from './useUrlSync'
import { defaultInputs } from '../schema'

describe('useUrlSync', () => {
  beforeEach(() => {
    // Reset URL to clean state — both the fragment (where we now write) and the
    // legacy query string (which we still read for back-compat).
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '', hash: '', pathname: '/' },
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
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    const { result } = renderHook(() => useUrlSync())

    act(() => {
      result.current.syncToUrl(defaultInputs())
    })

    // Should NOT have written immediately
    expect(replaceStateSpy).not.toHaveBeenCalled()

    // After 500ms → should write
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(replaceStateSpy).toHaveBeenCalledTimes(1)
  })

  it('writes state to the URL fragment (not the server-visible query string), and uses replaceState', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    const pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    const { result } = renderHook(() => useUrlSync())

    act(() => { result.current.syncToUrl(defaultInputs()) })
    act(() => { vi.advanceTimersByTime(500) })

    const url = replaceStateSpy.mock.calls[0][2] as string
    expect(url).toContain('#')
    expect(url).toMatch(/#.*s=/)
    expect(url).not.toMatch(/\?s=/) // never in the query string
    expect(pushStateSpy).not.toHaveBeenCalled() // replaceState keeps history clean
  })

  it('cancels pending write on unmount', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    const { result, unmount } = renderHook(() => useUrlSync())

    act(() => {
      result.current.syncToUrl(defaultInputs())
    })

    unmount()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Should NOT have written (unmounted before debounce fired)
    expect(replaceStateSpy).not.toHaveBeenCalled()
  })

  it('includes a ui= param in the fragment when prefs are passed', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    const { result } = renderHook(() => useUrlSync())

    act(() => {
      result.current.syncToUrl(defaultInputs(), { aesthetic: 'cool', theme: 'dark', density: 'compact' })
    })
    act(() => { vi.advanceTimersByTime(500) })

    expect(replaceStateSpy).toHaveBeenCalledTimes(1)
    const url = replaceStateSpy.mock.calls[0][2] as string
    expect(url).toContain('#')
    expect(url).toContain('ui=')
    expect(url).toContain('s=')
  })

  it('invokes onCommit after the debounced write fires', () => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
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

  it('inputsParseFailed is false when ?s= is absent', () => {
    const { result } = renderHook(() => useUrlSync())
    expect(result.current.inputsParseFailed).toBe(false)
  })

  it('inputsParseFailed is true when ?s= is present but unparseable', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?s=not-a-real-payload' },
      writable: true,
    })
    const { result } = renderHook(() => useUrlSync())
    expect(result.current.inputsParseFailed).toBe(true)
    expect(result.current.initialInputs).toBeNull()
  })

  it('inputsParseFailed is false when ?s= decodes successfully', async () => {
    const { compressInputs } = await import('../storage/urlState')
    const encoded = compressInputs(defaultInputs())
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: `?s=${encoded}` },
      writable: true,
    })
    const { result } = renderHook(() => useUrlSync())
    expect(result.current.inputsParseFailed).toBe(false)
    expect(result.current.initialInputs).not.toBeNull()
  })

  it('reads inputs from the #fragment', async () => {
    const { compressInputs } = await import('../storage/urlState')
    const encoded = compressInputs({ ...defaultInputs(), scenarioName: 'From fragment' })
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '', hash: `#s=${encoded}` },
      writable: true,
    })
    const { result } = renderHook(() => useUrlSync())
    expect(result.current.inputsParseFailed).toBe(false)
    expect(result.current.initialInputs?.scenarioName).toBe('From fragment')
  })

  it('reads UI prefs from the #fragment', async () => {
    const { compressUiPrefs } = await import('../storage/urlState')
    const encoded = compressUiPrefs({ aesthetic: 'mono', theme: 'dark', density: 'compact' })
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '', hash: `#ui=${encoded}` },
      writable: true,
    })
    const { result } = renderHook(() => useUrlSync())
    expect(result.current.initialUiPrefs).toEqual({ aesthetic: 'mono', theme: 'dark', density: 'compact' })
  })

  it('still reads legacy ?s= query links (back-compat), preferring the fragment', async () => {
    const { compressInputs } = await import('../storage/urlState')
    const fromQuery = compressInputs({ ...defaultInputs(), scenarioName: 'Legacy query' })
    const fromHash = compressInputs({ ...defaultInputs(), scenarioName: 'New fragment' })

    // Legacy-only link still loads.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: `?s=${fromQuery}`, hash: '' },
      writable: true,
    })
    expect(renderHook(() => useUrlSync()).result.current.initialInputs?.scenarioName).toBe('Legacy query')

    // When both exist, the fragment wins.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: `?s=${fromQuery}`, hash: `#s=${fromHash}` },
      writable: true,
    })
    expect(renderHook(() => useUrlSync()).result.current.initialInputs?.scenarioName).toBe('New fragment')
  })
})
