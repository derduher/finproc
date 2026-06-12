import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSimulation } from './useSimulation'
import { defaultInputs, WithdrawalStrategy } from '../schema'
import type { MonteCarloResult } from '../sim/montecarlo'

// Mock the worker module so tests don't spin up actual Web Workers
vi.mock('../worker/simulator', () => ({
  simulate: vi.fn(),
}))

// Mock the cache so IDB doesn't run in test environment
vi.mock('../storage/cache', () => ({
  getCache: vi.fn().mockResolvedValue(undefined),
  setCache: vi.fn().mockResolvedValue(undefined),
}))

// Mock Worker constructor
const mockTerminate = vi.fn()
const mockPostMessage = vi.fn()

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  terminate = mockTerminate
  postMessage = mockPostMessage
}

const MOCK_RESULT: MonteCarloResult = {
  yearlyResults: [{ age: 63, p10: 1_000_000, p50: 1_200_000, p90: 1_500_000, contributionsMedian: 0, socialSecurityMedian: 0, withdrawalsMedian: 0 }],
  successRate: 0.92,
  p50EndBalance: 1_200_000,
  p10EndBalance: 1_000_000,
  medianDepleteAge: undefined,
  p90EndBalance: 0,
  samplePaths: [],
  shortfallByPercentile: [],
}

const BASE_INPUTS = {
  ...defaultInputs(),
  person: { ...defaultInputs().person, currentAge: 62, maxAge: 75 },
  accounts: [{
    id: 'a', name: 'Roth', type: 'roth' as const,
    balance: 2_000_000,
    contributionAmount: 0,
    contributionType: 'flat' as const,
    contributionFrequency: 'monthly' as const,
    contributionEndAge: 61,
    withdrawalStartAge: 62,
  }],
  annualExpenses: 60000,
  withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Worker', MockWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSimulation — hook lifecycle', () => {
  it('starts with null result and not loading', () => {
    const { result } = renderHook(() => useSimulation(null))
    expect(result.current.result).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.stale).toBe(false)
  })

  it('goes loading when inputs are provided (cache miss)', async () => {
    const { getCache } = await import('../storage/cache')
    vi.mocked(getCache).mockResolvedValue(undefined) // ensure cache miss

    let resolve!: (r: MonteCarloResult) => void
    const deferred = new Promise<MonteCarloResult>((res) => { resolve = res })

    const { simulate } = await import('../worker/simulator')
    vi.mocked(simulate).mockReturnValue(deferred)

    const { result } = renderHook(() => useSimulation(BASE_INPUTS))
    // Should be loading while promise is pending
    await waitFor(() => expect(result.current.loading).toBe(true))

    // Resolve and check result
    act(() => { resolve(MOCK_RESULT) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.result).toEqual(MOCK_RESULT)
    expect(result.current.stale).toBe(false)
  })

  it('returns cache hit immediately without loading flash', async () => {
    const { getCache } = await import('../storage/cache')
    vi.mocked(getCache).mockResolvedValue(MOCK_RESULT) // cache hit

    const { simulate } = await import('../worker/simulator')

    const { result } = renderHook(() => useSimulation(BASE_INPUTS))

    await waitFor(() => expect(result.current.result).toEqual(MOCK_RESULT))
    expect(result.current.loading).toBe(false)
    expect(vi.mocked(simulate)).not.toHaveBeenCalled()
  })

  it('marks result stale and resets to loading when inputs change', async () => {
    const { getCache } = await import('../storage/cache')
    vi.mocked(getCache).mockResolvedValue(undefined)

    const { simulate } = await import('../worker/simulator')
    vi.mocked(simulate).mockResolvedValue(MOCK_RESULT)

    const inputsRef = { current: BASE_INPUTS }
    const { result, rerender } = renderHook(() => useSimulation(inputsRef.current))

    await waitFor(() => expect(result.current.result).not.toBeNull())
    expect(result.current.stale).toBe(false)

    // Change inputs → should mark stale immediately
    inputsRef.current = { ...BASE_INPUTS, annualExpenses: 80000 }
    rerender()

    await waitFor(() => expect(result.current.stale).toBe(true))
  })

  it('stores result in cache after computation', async () => {
    const { getCache, setCache } = await import('../storage/cache')
    vi.mocked(getCache).mockResolvedValue(undefined)
    vi.mocked(setCache).mockResolvedValue(undefined)

    const { simulate } = await import('../worker/simulator')
    vi.mocked(simulate).mockResolvedValue(MOCK_RESULT)

    const { result } = renderHook(() => useSimulation(BASE_INPUTS))
    await waitFor(() => expect(result.current.result).not.toBeNull())

    expect(vi.mocked(setCache)).toHaveBeenCalledWith(BASE_INPUTS, MOCK_RESULT)
  })

  it('coalesces rapid input edits into a single recompute', async () => {
    const { getCache } = await import('../storage/cache')
    vi.mocked(getCache).mockResolvedValue(undefined)

    const { simulate } = await import('../worker/simulator')
    vi.mocked(simulate).mockResolvedValue(MOCK_RESULT)

    const inputsRef = { current: BASE_INPUTS }
    const { result, rerender } = renderHook(() => useSimulation(inputsRef.current))

    // First run fires immediately (leading value, no debounce delay on mount)
    await waitFor(() => expect(result.current.result).not.toBeNull())
    expect(vi.mocked(simulate)).toHaveBeenCalledTimes(1)

    // Three rapid edits — like typing in a money field. Flush microtasks
    // between edits so each cache lookup settles (as it would between real
    // keystrokes) instead of being cancelled while still pending.
    for (const annualExpenses of [70_000, 75_000, 80_000]) {
      inputsRef.current = { ...BASE_INPUTS, annualExpenses }
      rerender()
      await act(async () => {})
    }

    // Only one more run, for the final value, once typing settles
    await waitFor(() => expect(vi.mocked(simulate)).toHaveBeenCalledTimes(2))
    expect(vi.mocked(simulate).mock.calls[1][0]).toEqual({ ...BASE_INPUTS, annualExpenses: 80_000 })

    await waitFor(() => expect(result.current.stale).toBe(false))
    expect(vi.mocked(simulate)).toHaveBeenCalledTimes(2)
  })

  it('surfaces errors from simulation', async () => {
    const { getCache } = await import('../storage/cache')
    vi.mocked(getCache).mockResolvedValue(undefined)

    const { simulate } = await import('../worker/simulator')
    vi.mocked(simulate).mockRejectedValue(new Error('Worker crashed'))

    const { result } = renderHook(() => useSimulation(BASE_INPUTS))
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.message).toBe('Worker crashed')
    expect(result.current.loading).toBe(false)
  })
})
