import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from './useIsMobile'

type Listener = () => void

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>()
  let matches = initial
  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
  return {
    set(next: boolean) {
      matches = next
      listeners.forEach((l) => l())
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useIsMobile', () => {
  it('reports the initial match state', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('updates when the media query changes', () => {
    const ctl = stubMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    act(() => ctl.set(true))
    expect(result.current).toBe(true)
  })

  it('reports desktop (false) when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })
})
