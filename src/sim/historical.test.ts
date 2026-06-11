import { describe, it, expect } from 'vitest'
import {
  HISTORICAL_SERIES,
  NAMED_SCENARIOS,
  historicalWindow,
  buildHistoricalSchedule,
  runHistoricalScenario,
  runCohortBacktest,
} from './historical'
import { defaultInputs } from '../schema'
import type { SimulationInputs } from '../schema'

describe('HISTORICAL_SERIES', () => {
  it('is contiguous and ascending by year with no gaps', () => {
    for (let i = 1; i < HISTORICAL_SERIES.length; i++) {
      expect(HISTORICAL_SERIES[i].year).toBe(HISTORICAL_SERIES[i - 1].year + 1)
    }
  })

  it('spans at least 1928..2023', () => {
    const first = HISTORICAL_SERIES[0].year
    const last = HISTORICAL_SERIES[HISTORICAL_SERIES.length - 1].year
    expect(first).toBeLessThanOrEqual(1928)
    expect(last).toBeGreaterThanOrEqual(2023)
  })

  it('captures the sign and rough magnitude of famous crisis years', () => {
    const by = (y: number) => HISTORICAL_SERIES.find((r) => r.year === y)!
    // Great Depression trough years are deeply negative.
    expect(by(1931).stock).toBeLessThan(-0.3)
    // 1933 was a violent rebound.
    expect(by(1933).stock).toBeGreaterThan(0.3)
    // 2008 GFC.
    expect(by(2008).stock).toBeLessThan(-0.3)
    // 1974 stagflation bear.
    expect(by(1974).stock).toBeLessThan(-0.2)
    // 1970s + 2022 high inflation.
    expect(by(1979).inflation).toBeGreaterThan(0.08)
    expect(by(2022).inflation).toBeGreaterThan(0.06)
    // Bonds: 2022 was the worst 10-year Treasury year on record (−17.8%).
    expect(by(2022).bond).toBeLessThan(-0.15)
    // 1982 disinflation rally (+32.8%).
    expect(by(1982).bond).toBeGreaterThan(0.3)
    // 2008 flight to safety: bonds UP while stocks crashed.
    expect(by(2008).bond).toBeGreaterThan(0.15)
    // 1969 and 2009 were losing bond years.
    expect(by(1969).bond).toBeLessThan(-0.04)
    expect(by(2009).bond).toBeLessThan(-0.1)
  })

  it('keeps returns and inflation within sane bounds', () => {
    for (const r of HISTORICAL_SERIES) {
      expect(r.stock).toBeGreaterThan(-0.6)
      expect(r.stock).toBeLessThan(0.7)
      expect(r.inflation).toBeGreaterThan(-0.15)
      expect(r.inflation).toBeLessThan(0.25)
      expect(r.bond).toBeGreaterThan(-0.25)
      expect(r.bond).toBeLessThan(0.4)
    }
  })
})

describe('NAMED_SCENARIOS', () => {
  it('every scenario start year exists in the series', () => {
    for (const s of NAMED_SCENARIOS) {
      expect(HISTORICAL_SERIES.some((r) => r.year === s.startYear)).toBe(true)
    }
  })

  it('includes the canonical crises', () => {
    const years = NAMED_SCENARIOS.map((s) => s.startYear)
    expect(years).toContain(1929)
    expect(years).toContain(2008)
  })
})

describe('historicalWindow', () => {
  it('returns consecutive years starting at startYear', () => {
    const w = historicalWindow(2008, 3)
    expect(w.map((r) => r.year)).toEqual([2008, 2009, 2010])
  })

  it('stops at the end of the series rather than overrunning', () => {
    const last = HISTORICAL_SERIES[HISTORICAL_SERIES.length - 1].year
    const w = historicalWindow(last, 10)
    expect(w.length).toBe(1)
    expect(w[0].year).toBe(last)
  })
})

describe('buildHistoricalSchedule', () => {
  const inputs: SimulationInputs = {
    ...defaultInputs(),
    person: { ...defaultInputs().person, currentAge: 60, retirementAge: 65, maxAge: 90 },
  }

  it('produces one entry per projection year', () => {
    const schedule = buildHistoricalSchedule({ inputs, startYear: 2008, anchorAge: 65 })
    expect(schedule.length).toBe(inputs.person.maxAge - inputs.person.currentAge)
  })

  it('replays the crisis return at the anchor age and expected rates before it', () => {
    const schedule = buildHistoricalSchedule({ inputs, startYear: 2008, anchorAge: 65 })
    const gfc = HISTORICAL_SERIES.find((r) => r.year === 2008)!
    // anchorAge 65 → index 65 - 60 = 5.
    expect(schedule[5].stockGrowth).toBeCloseTo(gfc.stock, 6)
    expect(schedule[5].inflation).toBeCloseTo(gfc.inflation, 6)
    // Pre-anchor years use the plan's expected mean (no crisis), not history.
    expect(schedule[0].stockGrowth).not.toBeCloseTo(gfc.stock, 6)
  })

  it('falls back to expected mean once history runs out', () => {
    // Start late so the historical window is shorter than the horizon.
    const last = HISTORICAL_SERIES[HISTORICAL_SERIES.length - 1].year
    const schedule = buildHistoricalSchedule({ inputs, startYear: last, anchorAge: 65 })
    // The year right after the anchor has no history → expected mean, finite.
    expect(Number.isFinite(schedule[6].stockGrowth)).toBe(true)
  })

  it('replays historical bond returns alongside stocks', () => {
    const schedule = buildHistoricalSchedule({ inputs, startYear: 2008, anchorAge: 65 })
    const by = (y: number) => HISTORICAL_SERIES.find((r) => r.year === y)!
    // anchorAge 65 → index 5 replays 2008: bonds rallied while stocks crashed.
    expect(schedule[5].bondGrowth).toBeCloseTo(by(2008).bond, 6)
    // Index 19 replays 2022: the historical bond crash, not the expected mean.
    expect(schedule[19].bondGrowth).toBeCloseTo(by(2022).bond, 6)
  })

  it('uses the expected bond mean outside the historical window', () => {
    const a = buildHistoricalSchedule({ inputs, startYear: 2008, anchorAge: 65 })
    const b = buildHistoricalSchedule({ inputs, startYear: 1973, anchorAge: 65 })
    // Pre-anchor years are crisis-independent (plan expected mean), and the
    // expected mean differs from the replayed crisis-year bond returns.
    expect(a[0].bondGrowth).toBeCloseTo(b[0].bondGrowth!, 10)
    expect(Number.isFinite(a[0].bondGrowth)).toBe(true)
    expect(a[5].bondGrowth).not.toBeCloseTo(a[0].bondGrowth!, 6)
    // Post-data tail: starting at the last year, age 66+ has no history → finite mean.
    const last = HISTORICAL_SERIES[HISTORICAL_SERIES.length - 1].year
    const tail = buildHistoricalSchedule({ inputs, startYear: last, anchorAge: 65 })
    expect(Number.isFinite(tail[6].bondGrowth)).toBe(true)
    expect(tail[6].bondGrowth).toBeCloseTo(tail[0].bondGrowth!, 10)
  })
})

/** A retired plan with a single liquid taxable account. */
function fundedPlan(balance: number, annualExpenses: number): SimulationInputs {
  const base = defaultInputs()
  return {
    ...base,
    person: { ...base.person, currentAge: 64, retirementAge: 65, maxAge: 90 },
    annualExpenses,
    accounts: [
      {
        id: 'brokerage',
        name: 'Brokerage',
        type: 'taxable',
        balance,
        costBasis: balance,
        contributionAmount: 0,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: 65,
        withdrawalStartAge: 0,
      },
    ],
  }
}

describe('runHistoricalScenario', () => {
  it('returns a balance per projection year and a survival verdict', () => {
    const inputs = fundedPlan(2_000_000, 60_000)
    const scenario = NAMED_SCENARIOS.find((s) => s.startYear === 2008)!
    const res = runHistoricalScenario(inputs, scenario)
    expect(res.balances.length).toBe(inputs.person.maxAge - inputs.person.currentAge)
    expect(typeof res.survived).toBe('boolean')
    expect(res.troughBalance).toBeLessThanOrEqual(Math.max(...res.balances, 0))
  })

  it('a brutal crisis on a thin plan depletes', () => {
    const thin = fundedPlan(250_000, 120_000)
    const gd = NAMED_SCENARIOS.find((s) => s.startYear === 1929)!
    const res = runHistoricalScenario(thin, gd)
    expect(res.survived).toBe(false)
    expect(res.depleteAge).toBeDefined()
  })

  it('a robust plan survives the same crisis', () => {
    const robust = fundedPlan(5_000_000, 60_000)
    const gd = NAMED_SCENARIOS.find((s) => s.startYear === 1929)!
    const res = runHistoricalScenario(robust, gd)
    expect(res.survived).toBe(true)
    expect(res.depleteAge).toBeUndefined()
  })
})

describe('runCohortBacktest', () => {
  const inputs = fundedPlan(2_000_000, 60_000)

  it('counts only start years with full historical coverage of the retirement horizon', () => {
    const bt = runCohortBacktest(inputs)
    expect(bt.total).toBeGreaterThan(0)
    expect(bt.survived).toBeLessThanOrEqual(bt.total)
    expect(bt.survivalRate).toBeCloseTo(bt.survived / bt.total, 6)
    // Failed years are real start years in the series.
    for (const y of bt.failedYears) {
      expect(HISTORICAL_SERIES.some((r) => r.year === y)).toBe(true)
    }
  })
})
