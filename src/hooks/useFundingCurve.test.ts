import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { defaultInputs } from '../schema'
import type { FundingCurveResult } from '../sim/fundingCurve'

// Mock the client, not the simulator: this hook races a solve against cache
// reads, and a real Worker in the test environment would intercept the call
// before the simulator module ever loads.
vi.mock('../worker/client', () => ({ fundingCurve: vi.fn() }))
vi.mock('../storage/cache', () => ({
  getFundingCache: vi.fn(),
  setFundingCache: vi.fn(),
}))

import { fundingCurve } from '../worker/client'
import { getFundingCache, setFundingCache } from '../storage/cache'
import { useFundingCurve } from './useFundingCurve'

const inputs = defaultInputs()

function curve(retirementAge = 65): FundingCurveResult {
  return {
    points: [
      { age: 60, requiredSorted: [1_000, 2_000], projected: { p10: 500, p50: 1_500, p90: 2_500 } },
    ],
    runCount: 2,
    retirementAge,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getFundingCache).mockResolvedValue(undefined)
  vi.mocked(setFundingCache).mockResolvedValue(undefined)
})

describe('useFundingCurve', () => {
  it('solves through the worker client once inputs settle', async () => {
    vi.mocked(fundingCurve).mockResolvedValue(curve())
    const { result } = renderHook(() => useFundingCurve(inputs))
    await waitFor(() => expect(result.current.curve).not.toBeNull(), { timeout: 2000 })
    expect(result.current.curve!.retirementAge).toBe(65)
    expect(result.current.loading).toBe(false)
    expect(result.current.stale).toBe(false)
  })

  it('writes a solved curve to the cache', async () => {
    const solved = curve()
    vi.mocked(fundingCurve).mockResolvedValue(solved)
    renderHook(() => useFundingCurve(inputs, 24))
    await waitFor(() => expect(setFundingCache).toHaveBeenCalledWith(inputs, 24, solved), {
      timeout: 2000,
    })
  })

  it('serves a cache hit without solving', async () => {
    vi.mocked(getFundingCache).mockResolvedValue(curve(70))
    const { result } = renderHook(() => useFundingCurve(inputs))
    await waitFor(() => expect(result.current.curve?.retirementAge).toBe(70), { timeout: 2000 })
    expect(fundingCurve).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('falls through to a solve when the cache read throws', async () => {
    vi.mocked(getFundingCache).mockRejectedValue(new Error('idb unavailable'))
    vi.mocked(fundingCurve).mockResolvedValue(curve())
    const { result } = renderHook(() => useFundingCurve(inputs))
    await waitFor(() => expect(result.current.curve).not.toBeNull(), { timeout: 2000 })
  })

  it('surfaces progress while solving', async () => {
    vi.mocked(fundingCurve).mockImplementation(async (_i, _o, onProgress) => {
      onProgress?.({ done: 3, total: 10 })
      return curve()
    })
    const { result } = renderHook(() => useFundingCurve(inputs))
    await waitFor(() => expect(result.current.curve).not.toBeNull(), { timeout: 2000 })
    expect(result.current.progress).toEqual({ done: 3, total: 10 })
  })

  it('does not solve for a null plan', async () => {
    const { result } = renderHook(() => useFundingCurve(null))
    await new Promise((r) => setTimeout(r, 450))
    expect(fundingCurve).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.curve).toBeNull()
  })

  it('stops loading when the solve rejects, and keeps the last good curve', async () => {
    vi.mocked(fundingCurve).mockResolvedValue(curve())
    const { result, rerender } = renderHook(({ i }) => useFundingCurve(i), {
      initialProps: { i: inputs },
    })
    await waitFor(() => expect(result.current.curve).not.toBeNull(), { timeout: 2000 })

    vi.mocked(fundingCurve).mockRejectedValue(new Error('worker died'))
    rerender({ i: { ...inputs, annualExpenses: 99_000 } })
    // Wait for the failing solve to actually be attempted — `loading` is still
    // false during the debounce window, so polling it alone passes too early.
    await waitFor(() => expect(fundingCurve).toHaveBeenCalledTimes(2), { timeout: 2000 })
    await waitFor(() => expect(result.current.stale).toBe(false), { timeout: 2000 })
    expect(result.current.loading).toBe(false)
    expect(result.current.curve).not.toBeNull()
  })

  it('marks the existing curve stale the moment inputs change', async () => {
    vi.mocked(fundingCurve).mockResolvedValue(curve())
    const { result, rerender } = renderHook(({ i }) => useFundingCurve(i), {
      initialProps: { i: inputs },
    })
    await waitFor(() => expect(result.current.curve).not.toBeNull(), { timeout: 2000 })

    let release: (c: FundingCurveResult) => void = () => {}
    vi.mocked(fundingCurve).mockReturnValue(
      new Promise<FundingCurveResult>((resolve) => {
        release = resolve
      }),
    )
    rerender({ i: { ...inputs, annualExpenses: 88_000 } })
    await waitFor(() => expect(result.current.stale).toBe(true))
    expect(result.current.curve).not.toBeNull()

    release(curve(71))
    await waitFor(() => expect(result.current.stale).toBe(false), { timeout: 2000 })
  })
})
