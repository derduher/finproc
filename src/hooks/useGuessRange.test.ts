import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { defaultInputs } from '../schema'
import type { SimulationInputs } from '../schema'

// Mock the worker *client* the hook imports from. The hook fires several solves
// concurrently; mocking the client (rather than the simulator) sidesteps the
// worker-vs-direct fallback race so every solve resolves deterministically here.
vi.mock('../worker/client', () => ({
  sustainableSpend: vi.fn(),
}))

import { sustainableSpend } from '../worker/client'
import { useGuessRange } from './useGuessRange'

const BEST = 100_000

// A spend that drops as each guess is pushed to its plausible-low perturbation,
// so the swings come out distinct and non-zero (ss 7.5k · match 3k · mix 4k).
function mockSpendFromInputs() {
  vi.mocked(sustainableSpend).mockImplementation(async (inp: SimulationInputs) => {
    let spend = BEST
    const ss = inp.socialSecurity?.annualAmountPresentDollars ?? 30_000
    spend -= 30_000 - ss
    if (!inp.accounts.some((a) => a.employerMatch)) spend -= 3_000
    if (inp.accounts.some((a) => a.id === 'mix-perturb-taxable')) spend -= 4_000
    return { spend, successRate: 0.9 }
  })
}

function seeded(): SimulationInputs {
  return {
    ...defaultInputs(),
    socialSecurity: { annualAmountPresentDollars: 30_000, claimAge: 67 },
    accounts: [
      {
        id: 'k401', name: '401(k)', type: 'traditional', balance: 250_000,
        contributionAmount: 1_500, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 65, withdrawalStartAge: 65, accountSubtype: '401k',
        employerMatch: { type: 'flat', annualAmount: 6_000 },
      },
    ],
  }
}

const NONE = { ss: false, match: false, mix: false }
const rss = (...xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0))

beforeEach(() => {
  vi.clearAllMocks()
  mockSpendFromInputs()
})

describe('useGuessRange', () => {
  it('is idle and solves nothing when the first run is inactive', async () => {
    const { result } = renderHook(() => useGuessRange(seeded(), BEST, false, NONE))
    await new Promise((r) => setTimeout(r, 450))
    expect(sustainableSpend).not.toHaveBeenCalled()
    expect(result.current.low).toBeNull()
    expect(result.current.high).toBeNull()
  })

  it('brackets the best guess by the combined swing of all three unknowns', async () => {
    const { result } = renderHook(() => useGuessRange(seeded(), BEST, true, NONE))
    await waitFor(() => expect(result.current.swings.ss).not.toBeNull(), { timeout: 2000 })
    const half = rss(7_500, 3_000, 4_000)
    expect(result.current.low).toBeCloseTo(BEST - half, 0)
    expect(result.current.high).toBeCloseTo(BEST + half, 0)
    expect(result.current.swings.ss).toBeCloseTo(7_500, 0)
    expect(result.current.swings.match).toBeCloseTo(3_000, 0)
    expect(result.current.swings.mix).toBeCloseTo(4_000, 0)
  })

  it('narrows the band as a guess is confirmed (its swing drops out)', async () => {
    const { result } = renderHook(() =>
      useGuessRange(seeded(), BEST, true, { ss: false, match: true, mix: false }),
    )
    await waitFor(() => expect(result.current.swings.ss).not.toBeNull(), { timeout: 2000 })
    const half = rss(7_500, 4_000) // match excluded
    expect(result.current.high).toBeCloseTo(BEST + half, 0)
    expect(result.current.swings.match).toBeNull()
  })

  it('collapses to a single number when all three are checked', async () => {
    const { result } = renderHook(() =>
      useGuessRange(seeded(), BEST, true, { ss: true, match: true, mix: true }),
    )
    await waitFor(() => expect(result.current.low).not.toBeNull(), { timeout: 2000 })
    expect(result.current.low).toBe(BEST)
    expect(result.current.high).toBe(BEST)
    expect(sustainableSpend).not.toHaveBeenCalled()
  })

  it('reports null bounds until the best guess is known', async () => {
    const { result } = renderHook(() => useGuessRange(seeded(), null, true, NONE))
    await new Promise((r) => setTimeout(r, 450))
    expect(result.current.low).toBeNull()
    expect(result.current.high).toBeNull()
  })
})
