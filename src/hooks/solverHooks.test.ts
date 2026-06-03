import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { defaultInputs } from '../schema'

// Mock the worker-exposed solvers so the hooks resolve without running Monte Carlo.
vi.mock('../worker/simulator', () => ({
  earliestRetirementAge: vi.fn(),
  requiredExtraSavings: vi.fn(),
  sustainableSpend: vi.fn(),
}))

import { earliestRetirementAge, requiredExtraSavings, sustainableSpend } from '../worker/simulator'
import { useEarliestRetirementAge } from './useEarliestRetirementAge'
import { useRequiredExtraSavings } from './useRequiredExtraSavings'
import { useSustainableSpend } from './useSustainableSpend'

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
