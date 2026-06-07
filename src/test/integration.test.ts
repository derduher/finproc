/**
 * Phase 11 Integration Tests
 *
 * Covers the full data pipeline:
 *   URL param → state restore → simulation → cache → stale indicator
 *
 * All tests run in jsdom (no real IndexedDB, no real Web Workers).
 * The worker and cache modules are mocked at the module boundary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { defaultInputs, WithdrawalStrategy } from '../schema'
import { compressInputs, decompressInputs, isShareable } from '../storage/urlState'
import { compressToEncodedURIComponent } from 'lz-string'
import { getCacheKey } from '../storage/cache'
import { runMonteCarlo } from '../sim/montecarlo'
import type { SimulationInputs } from '../schema'
import type { MonteCarloResult } from '../sim/montecarlo'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../worker/simulator', () => ({
  simulate: vi.fn(),
}))

vi.mock('../storage/cache', async (importOriginal) => {
  const original = await importOriginal<typeof import('../storage/cache')>()
  return {
    ...original, // keep getCacheKey (pure function)
    getCache: vi.fn().mockResolvedValue(undefined),
    setCache: vi.fn().mockResolvedValue(undefined),
  }
})

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_RESULT: MonteCarloResult = {
  yearlyResults: [
    { age: 63, p10: 800_000, p50: 1_200_000, p90: 1_600_000, contributionsMedian: 0, socialSecurityMedian: 0, withdrawalsMedian: 0 },
    { age: 64, p10: 750_000, p50: 1_150_000, p90: 1_650_000, contributionsMedian: 0, socialSecurityMedian: 0, withdrawalsMedian: 0 },
  ],
  successRate: 0.87,
  p50EndBalance: 1_150_000,
  p10EndBalance: 750_000,
  medianDepleteAge: undefined,
  p90EndBalance: 0,
  samplePaths: [],
  shortfallByPercentile: [],
}

function makeInputs(overrides: Partial<SimulationInputs> = {}): SimulationInputs {
  return {
    ...defaultInputs(),
    person: { ...defaultInputs().person, currentAge: 55, maxAge: 90 },
    accounts: [{
      id: 'a', name: 'Roth IRA', type: 'roth',
      balance: 500_000,
      contributionAmount: 1_000,
      contributionType: 'flat',
      contributionFrequency: 'monthly',
      contributionEndAge: 62,
      withdrawalStartAge: 59,
    }],
    baselineExpenses: [
      { id: 'general', label: 'General living', category: 'other', annualAmountPresentDollars: 50_000 },
    ],
    annualExpenses: 50_000,
    withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
    ...overrides,
  }
}

// ─── URL state round-trip ────────────────────────────────────────────────────

describe('URL state — round-trip', () => {
  it('compress → decompress recovers the exact same inputs', () => {
    const inputs = makeInputs()
    const encoded = compressInputs(inputs)
    const recovered = decompressInputs(encoded)
    expect(recovered).toEqual(inputs)
  })

  it('encoded URL is shareable (< 8000 chars)', () => {
    const inputs = makeInputs()
    const encoded = compressInputs(inputs)
    expect(isShareable(encoded)).toBe(true)
    expect(encoded.length).toBeLessThan(8000)
  })

  it('returns null for garbage input', () => {
    expect(decompressInputs('not-valid-base64!!!')).toBeNull()
  })

  it('returns null when Zod validation fails', () => {
    // A valid lz-string of invalid JSON shape
    const bad = compressToEncodedURIComponent(JSON.stringify({ garbage: true }))
    expect(decompressInputs(bad)).toBeNull()
  })

  it('compressed inputs survive multiple encode–decode cycles', () => {
    const inputs = makeInputs()
    const e1 = compressInputs(inputs)
    const r1 = decompressInputs(e1)!
    const e2 = compressInputs(r1)
    const r2 = decompressInputs(e2)
    expect(r2).toEqual(inputs)
  })
})

// ─── Cache key determinism ───────────────────────────────────────────────────

describe('cache — key determinism', () => {
  it('same inputs → same key regardless of property insertion order', () => {
    const a = makeInputs()
    // Construct b with reversed key order in person
    const b: SimulationInputs = {
      ...a,
      person: {
        maxAge: a.person.maxAge,
        currentAge: a.person.currentAge,
        retirementAge: a.person.retirementAge,
        annualSalary: a.person.annualSalary,
        salaryGrowthRate: a.person.salaryGrowthRate,
        marginalTaxRate: a.person.marginalTaxRate,
        ltcgRate: a.person.ltcgRate,
        filingStatus: a.person.filingStatus,
      },
    }
    expect(getCacheKey(a)).toBe(getCacheKey(b))
  })

  it('different inputs → different keys', () => {
    const a = makeInputs()
    const b = makeInputs({ annualExpenses: 99_999 })
    expect(getCacheKey(a)).not.toBe(getCacheKey(b))
  })
})

// ─── useSimulation integration ───────────────────────────────────────────────

describe('useSimulation — cache integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('cache miss → simulate called → result stored in cache', async () => {
    const { getCache, setCache } = await import('../storage/cache')
    const { simulate } = await import('../worker/simulator')
    vi.mocked(getCache).mockResolvedValue(undefined)
    vi.mocked(simulate).mockResolvedValue(MOCK_RESULT)

    const { useSimulation } = await import('../hooks/useSimulation')
    const inputs = makeInputs()
    const { result } = renderHook(() => useSimulation(inputs))

    await waitFor(() => expect(result.current.result).not.toBeNull(), { timeout: 10_000 })

    expect(vi.mocked(simulate)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(setCache)).toHaveBeenCalledWith(inputs, MOCK_RESULT)
    expect(result.current.loading).toBe(false)
    expect(result.current.stale).toBe(false)
  }, 15_000)

  it('cache hit → simulate NOT called, result returned immediately', async () => {
    const { getCache } = await import('../storage/cache')
    const { simulate } = await import('../worker/simulator')
    vi.mocked(getCache).mockResolvedValue(MOCK_RESULT)

    const { useSimulation } = await import('../hooks/useSimulation')
    const inputs = makeInputs()
    const { result } = renderHook(() => useSimulation(inputs))

    await waitFor(() => expect(result.current.result).toEqual(MOCK_RESULT), { timeout: 10_000 })

    expect(vi.mocked(simulate)).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  }, 15_000)

  it('inputs change → stale=true while recomputing', async () => {
    const { getCache } = await import('../storage/cache')
    const { simulate } = await import('../worker/simulator')
    vi.mocked(getCache).mockResolvedValue(undefined)
    vi.mocked(simulate).mockResolvedValue(MOCK_RESULT)

    const { useSimulation } = await import('../hooks/useSimulation')

    let inputs = makeInputs()
    const { result, rerender } = renderHook(() => useSimulation(inputs))

    // Wait for first result to settle
    await waitFor(() => expect(result.current.result).not.toBeNull(), { timeout: 10_000 })
    expect(result.current.stale).toBe(false)

    // Mutate inputs and trigger re-render with slow second simulation
    let resolveSecond!: (r: MonteCarloResult) => void
    const secondRun = new Promise<MonteCarloResult>((res) => { resolveSecond = res })
    vi.mocked(simulate).mockReturnValue(secondRun)

    inputs = makeInputs({ annualExpenses: 70_000 })
    rerender()

    // stale should be true while second run is pending
    await waitFor(() => expect(result.current.stale).toBe(true), { timeout: 10_000 })

    // Settle second run
    act(() => { resolveSecond(MOCK_RESULT) })
    await waitFor(() => expect(result.current.stale).toBe(false), { timeout: 10_000 })
    expect(result.current.result).toEqual(MOCK_RESULT)
  }, 30_000)
})

// ─── Store + URL wiring ──────────────────────────────────────────────────────

describe('store + URL wiring', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { search: '', href: 'http://localhost/' },
      history: { pushState: vi.fn() },
      innerWidth: 1440,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('compressInputs output is decompressible and valid', () => {
    const inputs = makeInputs()
    const compressed = compressInputs(inputs)
    expect(typeof compressed).toBe('string')
    expect(compressed.length).toBeGreaterThan(0)
    const decoded = decompressInputs(compressed)
    expect(decoded).not.toBeNull()
    expect(decoded?.person.currentAge).toBe(55)
  })

  it('URL param ?s= round-trip via useUrlSync', async () => {
    const inputs = makeInputs()
    const encoded = compressInputs(inputs)

    // Simulate reading encoded from URL
    vi.stubGlobal('window', {
      location: { search: `?s=${encoded}`, href: `http://localhost/?s=${encoded}` },
      history: { pushState: vi.fn() },
      innerWidth: 1440,
    })

    const { useUrlSync } = await import('../hooks/useUrlSync')
    const { result } = renderHook(() => useUrlSync())

    expect(result.current.initialInputs).not.toBeNull()
    expect(result.current.initialInputs?.person.currentAge).toBe(55)
    expect(result.current.initialInputs?.annualExpenses).toBe(50_000)
  })
})

// ─── Full pipeline smoke test ─────────────────────────────────────────────────

describe('full pipeline — sample inputs → projection', () => {
  it('runMonteCarlo produces valid output structure for sample inputs', () => {
    const inputs = makeInputs()
    // Use small runCount for speed in tests
    const result = runMonteCarlo(inputs, 50, 42)

    expect(result.successRate).toBeGreaterThanOrEqual(0)
    expect(result.successRate).toBeLessThanOrEqual(1)
    expect(result.yearlyResults.length).toBe(inputs.person.maxAge - inputs.person.currentAge)
    expect(result.p10EndBalance).toBeLessThanOrEqual(result.p50EndBalance)

    for (const yr of result.yearlyResults) {
      expect(yr.p10).toBeLessThanOrEqual(yr.p50)
      expect(yr.p50).toBeLessThanOrEqual(yr.p90)
      expect(yr.age).toBeGreaterThan(inputs.person.currentAge)
    }
  })

  it('same seed → identical results (determinism)', () => {
    const inputs = makeInputs()
    const r1 = runMonteCarlo(inputs, 50, 42)
    const r2 = runMonteCarlo(inputs, 50, 42)
    expect(r1.successRate).toBe(r2.successRate)
    expect(r1.p50EndBalance).toBe(r2.p50EndBalance)
    expect(r1.yearlyResults).toEqual(r2.yearlyResults)
  })

  it('well-funded plan succeeds; underfunded plan fails', () => {
    // Rich scenario: $5M balance, tiny $10K/yr expenses → near-certain success
    const rich = makeInputs({
      accounts: [{
        id: 'a', name: 'Roth IRA', type: 'roth',
        balance: 5_000_000,
        contributionAmount: 0,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: 54,
        withdrawalStartAge: 55,
      }],
      annualExpenses: 10_000,
    })
    // Poor scenario: $50K balance, $200K/yr expenses → certain failure
    const poor = makeInputs({
      accounts: [{
        id: 'a', name: 'Roth IRA', type: 'roth',
        balance: 50_000,
        contributionAmount: 0,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: 54,
        withdrawalStartAge: 55,
      }],
      annualExpenses: 200_000,
    })
    const rRich = runMonteCarlo(rich, 50, 42)
    const rPoor = runMonteCarlo(poor, 50, 42)
    expect(rRich.successRate).toBeGreaterThan(rPoor.successRate)
    expect(rRich.successRate).toBeGreaterThan(0.8)
    expect(rPoor.successRate).toBe(0)
  })
})
