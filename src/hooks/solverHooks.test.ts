import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { defaultInputs } from '../schema'

// Mock the worker-exposed solvers so the hooks resolve without running Monte Carlo.
vi.mock('../worker/simulator', () => ({
  earliestRetirementAge: vi.fn(),
  requiredExtraSavings: vi.fn(),
  sustainableSpend: vi.fn(),
  sensitivity: vi.fn(),
  insights: vi.fn(),
}))

import { earliestRetirementAge, requiredExtraSavings, sustainableSpend, sensitivity, insights } from '../worker/simulator'
import { useEarliestRetirementAge } from './useEarliestRetirementAge'
import { useRequiredExtraSavings } from './useRequiredExtraSavings'
import { useSustainableSpend } from './useSustainableSpend'
import { useSensitivity } from './useSensitivity'
import { useInsights } from './useInsights'

const inputs = defaultInputs()

// Real timers: the hooks debounce inputs by 350ms, so waitFor polls past that.
beforeEach(() => vi.clearAllMocks())

describe('useEarliestRetirementAge', () => {
  it('exposes the solved age once inputs settle', async () => {
    vi.mocked(earliestRetirementAge).mockResolvedValue({ age: 63, successRate: 0.91 })
    const { result } = renderHook(() => useEarliestRetirementAge(inputs))
    await waitFor(() => expect(result.current.age).toBe(63), { timeout: 2000 })
    expect(result.current.successRate).toBeCloseTo(0.91)
  })

  it('reports undefined when no age reaches the target', async () => {
    vi.mocked(earliestRetirementAge).mockResolvedValue(undefined)
    const { result } = renderHook(() => useEarliestRetirementAge(inputs))
    await waitFor(() => expect(result.current.age).toBeUndefined(), { timeout: 2000 })
  })
})

describe('useRequiredExtraSavings', () => {
  it('does not solve when disabled', async () => {
    const { result } = renderHook(() => useRequiredExtraSavings(inputs, false))
    await new Promise((r) => setTimeout(r, 450))
    expect(requiredExtraSavings).not.toHaveBeenCalled()
    expect(result.current.extraMonthly).toBeNull()
  })

  it('solves when enabled', async () => {
    vi.mocked(requiredExtraSavings).mockResolvedValue({ extraMonthly: 450, successRate: 0.9 })
    const { result } = renderHook(() => useRequiredExtraSavings(inputs, true))
    await waitFor(() => expect(result.current.extraMonthly).toBe(450), { timeout: 2000 })
  })
})

describe('useSustainableSpend', () => {
  it('exposes the solved spend', async () => {
    vi.mocked(sustainableSpend).mockResolvedValue({ spend: 72_000, successRate: 0.9 })
    const { result } = renderHook(() => useSustainableSpend(inputs))
    await waitFor(() => expect(result.current.spend).toBe(72_000), { timeout: 2000 })
  })
})

describe('useSensitivity', () => {
  it('exposes tornado rows once inputs settle', async () => {
    vi.mocked(sensitivity).mockResolvedValue([
      { label: 'Annual expenses', sub: '±20%', loDelta: 0.1, hiDelta: -0.15 },
    ])
    const { result } = renderHook(() => useSensitivity(inputs))
    await waitFor(() => expect(result.current.data?.length).toBe(1), { timeout: 2000 })
    expect(result.current.data![0].label).toBe('Annual expenses')
    expect(result.current.loading).toBe(false)
  })
})

describe('useInsights', () => {
  it('exposes insight cards once inputs settle', async () => {
    vi.mocked(insights).mockResolvedValue([
      { tone: 'good', title: 'Tax-optimal strategy is paying off', body: 'x', cta: 'See strategy' },
    ])
    const { result } = renderHook(() => useInsights(inputs))
    await waitFor(() => expect(result.current.data?.length).toBe(1), { timeout: 2000 })
    expect(result.current.data![0].tone).toBe('good')
  })
})

// ---------------------------------------------------------------------------
// Guard / edge branches shared by every solver hook: the null-inputs early
// return, the rejected-promise catch, explicit (non-default) optional args,
// and the "resolved/rejected after unmount" cancellation guard.
// ---------------------------------------------------------------------------

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('solver hooks — guard and edge branches', () => {
  it('useSustainableSpend: null inputs skip the solve and clear loading', async () => {
    const { result } = renderHook(() => useSustainableSpend(null))
    await flush()
    expect(sustainableSpend).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.spend).toBeNull()
  })

  it('useSustainableSpend: rejected solve (with explicit args) clears loading', async () => {
    vi.mocked(sustainableSpend).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSustainableSpend(inputs, 0.8, 100))
    await waitFor(() => expect(sustainableSpend).toHaveBeenCalled(), { timeout: 2000 })
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 })
    expect(result.current.spend).toBeNull()
  })

  it('useSustainableSpend: resolve after unmount is ignored', async () => {
    const d = deferred<{ spend: number; successRate: number }>()
    vi.mocked(sustainableSpend).mockReturnValue(d.promise)
    const { unmount } = renderHook(() => useSustainableSpend(inputs))
    await waitFor(() => expect(sustainableSpend).toHaveBeenCalled(), { timeout: 2000 })
    unmount()
    d.resolve({ spend: 1, successRate: 0.9 })
    await flush()
  })

  it('useEarliestRetirementAge: null inputs skip the solve', async () => {
    const { result } = renderHook(() => useEarliestRetirementAge(null))
    await flush()
    expect(earliestRetirementAge).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('useEarliestRetirementAge: rejected solve (explicit args) clears loading', async () => {
    vi.mocked(earliestRetirementAge).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useEarliestRetirementAge(inputs, 0.8, 100))
    await waitFor(() => expect(earliestRetirementAge).toHaveBeenCalled(), { timeout: 2000 })
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 })
  })

  it('useEarliestRetirementAge: rejection after unmount is ignored', async () => {
    const d = deferred<{ age: number; successRate: number }>()
    vi.mocked(earliestRetirementAge).mockReturnValue(d.promise)
    const { unmount } = renderHook(() => useEarliestRetirementAge(inputs))
    await waitFor(() => expect(earliestRetirementAge).toHaveBeenCalled(), { timeout: 2000 })
    unmount()
    d.reject(new Error('late'))
    await d.promise.catch(() => {})
    await flush()
  })

  it('useRequiredExtraSavings: null inputs skip the solve even when enabled', async () => {
    const { result } = renderHook(() => useRequiredExtraSavings(null, true))
    await flush()
    expect(requiredExtraSavings).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.extraMonthly).toBeNull()
  })

  it('useRequiredExtraSavings: rejected solve (explicit args) clears loading', async () => {
    vi.mocked(requiredExtraSavings).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useRequiredExtraSavings(inputs, true, 0.8, 100))
    await waitFor(() => expect(requiredExtraSavings).toHaveBeenCalled(), { timeout: 2000 })
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 })
  })

  it('useRequiredExtraSavings: resolve after unmount is ignored', async () => {
    const d = deferred<{ extraMonthly: number; successRate: number }>()
    vi.mocked(requiredExtraSavings).mockReturnValue(d.promise)
    const { unmount } = renderHook(() => useRequiredExtraSavings(inputs, true))
    await waitFor(() => expect(requiredExtraSavings).toHaveBeenCalled(), { timeout: 2000 })
    unmount()
    d.resolve({ extraMonthly: 1, successRate: 0.9 })
    await flush()
  })

  it('useSensitivity: null inputs skip the solve', async () => {
    const { result } = renderHook(() => useSensitivity(null))
    await flush()
    expect(sensitivity).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('useSensitivity: rejected solve (explicit runCount) clears loading', async () => {
    vi.mocked(sensitivity).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSensitivity(inputs, 100))
    await waitFor(() => expect(sensitivity).toHaveBeenCalled(), { timeout: 2000 })
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 })
  })

  it('useSensitivity: resolve after unmount is ignored', async () => {
    const d = deferred<[]>()
    vi.mocked(sensitivity).mockReturnValue(d.promise)
    const { unmount } = renderHook(() => useSensitivity(inputs))
    await waitFor(() => expect(sensitivity).toHaveBeenCalled(), { timeout: 2000 })
    unmount()
    d.resolve([])
    await flush()
  })

  it('useInsights: null inputs skip the solve', async () => {
    const { result } = renderHook(() => useInsights(null))
    await flush()
    expect(insights).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('useInsights: rejected solve (explicit runCount) clears loading', async () => {
    vi.mocked(insights).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useInsights(inputs, 500))
    await waitFor(() => expect(insights).toHaveBeenCalled(), { timeout: 2000 })
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 })
  })

  it('useInsights: resolve after unmount is ignored', async () => {
    const d = deferred<[]>()
    vi.mocked(insights).mockReturnValue(d.promise)
    const { unmount } = renderHook(() => useInsights(inputs))
    await waitFor(() => expect(insights).toHaveBeenCalled(), { timeout: 2000 })
    unmount()
    d.resolve([])
    await flush()
  })
})
