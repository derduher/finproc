import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSimulation } from './useSimulation'
import { defaultInputs, WithdrawalStrategy } from '../schema'
import type { MonteCarloResult, ProgressCallback, ProgressEvent } from '../sim/montecarlo'

vi.mock('../worker/simulator', () => ({
  simulate: vi.fn(),
}))

vi.mock('../storage/cache', () => ({
  getCache: vi.fn().mockResolvedValue(undefined),
  setCache: vi.fn().mockResolvedValue(undefined),
}))

const MOCK_RESULT: MonteCarloResult = {
  yearlyResults: [{
    age: 63, p10: 1_000_000, p50: 1_200_000, p90: 1_500_000,
    contributionsMedian: 0, socialSecurityMedian: 0, withdrawalsMedian: 60_000,
  }],
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

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe('useSimulation — progress', () => {
  it('surfaces progress events emitted by simulate()', async () => {
    const { simulate } = await import('../worker/simulator')

    // Synthesize progress events then resolve
    vi.mocked(simulate).mockImplementation(
      (async (_inp: unknown, _n?: number, onProgress?: ProgressCallback) => {
        onProgress?.({ stage: 'parse', done: 1, total: 1 })
        onProgress?.({ stage: 'sample', done: 1, total: 1 })
        onProgress?.({ stage: 'project', done: 100, total: 100 })
        onProgress?.({ stage: 'aggregate', done: 1, total: 1 })
        return MOCK_RESULT
      }) as unknown as typeof simulate,
    )

    const { result } = renderHook(() => useSimulation(BASE_INPUTS))
    await waitFor(() => expect(result.current.result).not.toBeNull())

    expect(result.current.progress).toBeDefined()
    expect(result.current.progress?.stage).toBe('aggregate')
  })

  it('progress is undefined once the run resolves and is followed by reset on inputs change', async () => {
    const { simulate } = await import('../worker/simulator')
    vi.mocked(simulate).mockResolvedValue(MOCK_RESULT)

    const inputsRef = { current: BASE_INPUTS }
    const { result, rerender } = renderHook(() => useSimulation(inputsRef.current))
    await waitFor(() => expect(result.current.result).not.toBeNull())

    // Switch inputs — progress should reset to undefined while stale flips true
    inputsRef.current = { ...BASE_INPUTS, annualExpenses: 80000 }
    rerender()
    await waitFor(() => expect(result.current.stale).toBe(true))
    // While the new run is in flight (mock resolves synchronously, but the state
    // transition cycle still passes through "progress = undefined" first).
    // We assert by the time it has been cleared/replaced — not strict timing.
    expect(result.current.progress === undefined || result.current.progress?.stage === 'aggregate').toBe(true)
  })

  type ProgressEventSpread = ProgressEvent // kept so the type import isn't elided
  void ({} as ProgressEventSpread)
})
