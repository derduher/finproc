import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock idb-keyval before importing cache
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}))

import { getCacheKey, getCache, setCache } from './cache'
import { defaultInputs } from '../schema'
import type { MonteCarloResult } from '../sim/montecarlo'
import * as idb from 'idb-keyval'

const MOCK_RESULT: MonteCarloResult = {
  yearlyResults: [],
  successRate: 0.85,
  p50EndBalance: 500_000,
  p10EndBalance: 200_000,
  medianDepleteAge: undefined,
  p90EndBalance: 0,
  samplePaths: [],
  shortfallByPercentile: [],
}

describe('cache — key determinism', () => {
  it('same inputs → same cache key', () => {
    const inp = defaultInputs()
    const k1 = getCacheKey(inp)
    const k2 = getCacheKey(inp)
    expect(k1).toBe(k2)
  })

  it('different inputs → different cache key', () => {
    const inp1 = defaultInputs()
    const inp2 = { ...defaultInputs(), annualExpenses: 99999 }
    expect(getCacheKey(inp1)).not.toBe(getCacheKey(inp2))
  })

  it('seed change → different cache key (seed affects MC output)', () => {
    const inp1 = { ...defaultInputs(), seed: 1 }
    const inp2 = { ...defaultInputs(), seed: 2 }
    expect(getCacheKey(inp1)).not.toBe(getCacheKey(inp2))
  })

  it('key is namespaced by an output-shape version so legacy entries are ignored', () => {
    // Bumping CACHE_VERSION when MonteCarloResult gains fields (samplePaths,
    // p90EndBalance, shortfallByPercentile, …) keeps stale-shaped entries from
    // being served.
    expect(getCacheKey(defaultInputs())).toMatch(/^mc:v\d+:/)
  })
})

describe('cache — round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getCache returns undefined on miss', async () => {
    vi.mocked(idb.get).mockResolvedValue(undefined)
    const inp = defaultInputs()
    const result = await getCache(inp)
    expect(result).toBeUndefined()
    expect(idb.get).toHaveBeenCalledWith(getCacheKey(inp))
  })

  it('setCache stores result keyed by input hash', async () => {
    vi.mocked(idb.set).mockResolvedValue(undefined)
    const inp = defaultInputs()
    await setCache(inp, MOCK_RESULT)
    expect(idb.set).toHaveBeenCalledWith(getCacheKey(inp), MOCK_RESULT)
  })

  it('getCache returns stored result on hit', async () => {
    vi.mocked(idb.get).mockResolvedValue(MOCK_RESULT)
    const inp = defaultInputs()
    const result = await getCache(inp)
    expect(result).toEqual(MOCK_RESULT)
  })
})
