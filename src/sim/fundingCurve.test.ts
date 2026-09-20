import { describe, it, expect } from 'vitest'
import {
  runFundingCurve,
  requiredAt,
  crossingAge,
  crossingBand,
  fullyFundedAge,
  gapAt,
  FUNDING_GHOST_CONFIDENCES,
  MAX_SOLVE_AGE,
} from './fundingCurve'
import { defaultInputs } from '../schema'
import type { Account, SimulationInputs } from '../schema'

function acct(o: Partial<Account> & Pick<Account, 'id' | 'type'>): Account {
  return {
    name: o.id,
    balance: 0,
    contributionAmount: 0,
    contributionType: 'flat',
    contributionFrequency: 'monthly',
    contributionEndAge: 65,
    withdrawalStartAge: 60,
    stockAllocation: 0.8,
    ...o,
  } as Account
}

function scenario(overrides: Partial<SimulationInputs> = {}): SimulationInputs {
  const base = defaultInputs()
  return {
    ...base,
    person: {
      ...base.person,
      currentAge: 45,
      retirementAge: 65,
      maxAge: 90,
      annualSalary: 120_000,
      salaryGrowthRate: 0.02,
    },
    accounts: [
      acct({ id: '401k', type: 'traditional', balance: 250_000, contributionAmount: 1_500 }),
      acct({ id: 'roth', type: 'roth', balance: 80_000, contributionAmount: 500 }),
      acct({
        id: 'brk',
        type: 'taxable',
        balance: 100_000,
        costBasis: 70_000,
        contributionAmount: 800,
        withdrawalStartAge: 0,
      }),
    ],
    annualExpenses: 70_000,
    breakpoints: [],
    ...overrides,
  }
}

// Small but not degenerate: enough runs that quantiles are meaningful, few
// enough that the whole suite stays quick.
const OPTS = { runCount: 24, maxSolveAge: 70 } as const

describe('requiredAt', () => {
  it('reads the nearest-rank quantile from the sorted per-run minima', () => {
    const point = { age: 60, requiredSorted: [100, 200, 300, 400, 500], projected: { p10: 0, p50: 0, p90: 0 } }
    expect(requiredAt(point, 0)).toBe(100)
    expect(requiredAt(point, 1)).toBe(500)
    expect(requiredAt(point, 0.5)).toBe(300)
  })

  it('clamps out-of-range confidences instead of reading past the array', () => {
    const point = { age: 60, requiredSorted: [100, 200], projected: { p10: 0, p50: 0, p90: 0 } }
    expect(requiredAt(point, -1)).toBe(100)
    expect(requiredAt(point, 5)).toBe(200)
  })

  it('returns 0 for an empty solve rather than NaN', () => {
    const point = { age: 60, requiredSorted: [], projected: { p10: 0, p50: 0, p90: 0 } }
    expect(requiredAt(point, 0.9)).toBe(0)
  })
})

describe('runFundingCurve', () => {
  it('covers every age from today up to the solve ceiling', () => {
    const result = runFundingCurve(scenario(), OPTS)
    expect(result.points[0].age).toBe(45)
    expect(result.points.at(-1)!.age).toBe(70)
    expect(result.points).toHaveLength(26)
  })

  it('caps the solve ceiling at MAX_SOLVE_AGE even for a young plan', () => {
    const result = runFundingCurve(scenario({ person: { ...scenario().person, currentAge: 30 } }), {
      runCount: 8,
    })
    expect(result.points.at(-1)!.age).toBe(MAX_SOLVE_AGE)
  })

  it('never solves past the end of the plan', () => {
    const inputs = scenario()
    const short = { ...inputs, person: { ...inputs.person, maxAge: 66 } }
    const result = runFundingCurve(short, OPTS)
    expect(result.points.at(-1)!.age).toBeLessThan(66)
  })

  it('needs less money the later you retire', () => {
    const result = runFundingCurve(scenario(), OPTS)
    for (let i = 1; i < result.points.length; i++) {
      expect(requiredAt(result.points[i], 0.9)).toBeLessThanOrEqual(
        requiredAt(result.points[i - 1], 0.9) + 1e-6,
      )
    }
  })

  it('needs more money at higher confidence', () => {
    const result = runFundingCurve(scenario(), OPTS)
    const mid = result.points[Math.floor(result.points.length / 2)]
    expect(requiredAt(mid, 0.8)).toBeLessThanOrEqual(requiredAt(mid, 0.9))
    expect(requiredAt(mid, 0.9)).toBeLessThanOrEqual(requiredAt(mid, 0.95))
  })

  it('needs more money when you plan to spend more', () => {
    const lean = runFundingCurve(scenario({ annualExpenses: 50_000 }), OPTS)
    const rich = runFundingCurve(scenario({ annualExpenses: 90_000 }), OPTS)
    const at = (r: typeof lean) => requiredAt(r.points.find((p) => p.age === 65)!, 0.9)
    expect(at(rich)).toBeGreaterThan(at(lean))
  })

  it('is insensitive to withdrawalStartAge, because the curve assumes early access', () => {
    const open = scenario()
    const locked = scenario({
      accounts: scenario().accounts.map((a) => ({ ...a, withdrawalStartAge: 75 })),
    })
    const at = (i: SimulationInputs) =>
      requiredAt(runFundingCurve(i, OPTS).points.find((p) => p.age === 55)!, 0.9)
    expect(at(locked)).toBeCloseTo(at(open), -4)
  })

  it('projects a rising median balance with an ordered p10/p50/p90 band', () => {
    const result = runFundingCurve(scenario(), OPTS)
    for (const p of result.points) {
      expect(p.projected.p10).toBeLessThanOrEqual(p.projected.p50)
      expect(p.projected.p50).toBeLessThanOrEqual(p.projected.p90)
    }
    expect(result.points.at(-1)!.projected.p50).toBeGreaterThan(result.points[0].projected.p50)
  })

  it('starts the projection at the money you actually have today', () => {
    const inputs = scenario()
    const result = runFundingCurve(inputs, OPTS)
    const saved = inputs.accounts.reduce((s, a) => s + a.balance, 0)
    expect(result.points[0].projected.p50).toBeCloseTo(saved, -3)
    expect(result.points[0].projected.p10).toBeCloseTo(saved, -3)
  })

  it('is bit-identical for the same inputs and seed', () => {
    const a = runFundingCurve(scenario(), OPTS)
    const b = runFundingCurve(scenario(), OPTS)
    expect(b).toEqual(a)
  })

  it('reports progress once per solved age', () => {
    const seen: { done: number; total: number }[] = []
    runFundingCurve(scenario(), { ...OPTS, onProgress: (e) => seen.push(e) })
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.at(-1)).toEqual({ done: 26, total: 26 })
    for (let i = 1; i < seen.length; i++) expect(seen[i].done).toBeGreaterThan(seen[i - 1].done)
  })

  it('carries the ghost confidence levels the chart draws', () => {
    expect(FUNDING_GHOST_CONFIDENCES).toEqual([0.8, 0.95])
  })
})

describe('runFundingCurve — edge plans', () => {
  it('needs nothing at an age where guaranteed income already covers spending', () => {
    const covered = scenario({
      person: { ...scenario().person, currentAge: 62, maxAge: 70 },
      annualExpenses: 8_000,
      socialSecurity: { claimAge: 62, annualAmountPresentDollars: 90_000 },
    })
    const result = runFundingCurve(covered, { runCount: 6, maxSolveAge: 64 })
    expect(requiredAt(result.points[0], 0.9)).toBe(0)
  })

  it('handles a plan with accounts but no money in them', () => {
    const empty = scenario({
      accounts: scenario().accounts.map((a) => ({ ...a, balance: 0, costBasis: undefined })),
    })
    const result = runFundingCurve(empty, { runCount: 6, maxSolveAge: 50 })
    expect(result.points[0].projected.p50).toBe(0)
    // Money still has somewhere to go, so the requirement is a real number.
    expect(requiredAt(result.points[0], 0.9)).toBeGreaterThan(0)
  })

  it('conditions the horizon on surviving to each age under stochastic longevity', () => {
    const result = runFundingCurve(
      scenario({ longevity: 'stochastic' }),
      { runCount: 8, maxSolveAge: 55 },
    )
    expect(result.points).toHaveLength(11)
    for (const p of result.points) expect(requiredAt(p, 0.9)).toBeGreaterThan(0)
  })

  it('treats an unset longevity mode as fixed', () => {
    const unset = scenario({ longevity: undefined })
    const fixed = scenario({ longevity: 'fixed' })
    const at = (i: SimulationInputs) =>
      requiredAt(runFundingCurve(i, { runCount: 6, maxSolveAge: 50 }).points[0], 0.9)
    expect(at(unset)).toBe(at(fixed))
  })

  it('runs on its own defaults when given no options', () => {
    const late = scenario({ person: { ...scenario().person, currentAge: 88, maxAge: 90 } })
    const result = runFundingCurve(late)
    expect(result.runCount).toBe(200)
    // Past the solve ceiling, so only the one age still on the table.
    expect(result.points.map((p) => p.age)).toEqual([88])
  })
})

describe('crossingAge', () => {
  it('finds the first age where the projected series clears the requirement', () => {
    const result = runFundingCurve(scenario(), OPTS)
    const age = crossingAge(result, 0.9, 'p50')
    if (age !== undefined) {
      const at = result.points.find((p) => p.age === age)!
      expect(at.projected.p50).toBeGreaterThanOrEqual(requiredAt(at, 0.9))
      const before = result.points.find((p) => p.age === age - 1)
      if (before) expect(before.projected.p50).toBeLessThan(requiredAt(before, 0.9))
    }
  })

  it('crosses no later on the optimistic band than on the median', () => {
    const result = runFundingCurve(scenario(), OPTS)
    const hi = crossingAge(result, 0.9, 'p90')
    const mid = crossingAge(result, 0.9, 'p50')
    if (hi !== undefined && mid !== undefined) expect(hi).toBeLessThanOrEqual(mid)
  })

  it('returns undefined when the plan never catches up', () => {
    const broke = runFundingCurve(
      scenario({ annualExpenses: 400_000, accounts: [acct({ id: 'brk', type: 'taxable', balance: 1_000 })] }),
      OPTS,
    )
    expect(crossingAge(broke, 0.9, 'p50')).toBeUndefined()
  })
})

describe('seeded pins', () => {
  // Characterization, not a claim about the world. These break whenever the RNG
  // draw order changes — `buildRateSchedule` consumes three epistemic draws then
  // three per year — which is exactly what they're for. Re-pin deliberately, and
  // only once you know why the number moved.
  it('holds the solved requirement for a known plan', () => {
    const result = runFundingCurve(scenario(), OPTS)
    const at = (age: number) => result.points.find((p) => p.age === age)!
    expect(requiredAt(at(60), 0.9)).toBeCloseTo(1_300_781, -3)
    expect(requiredAt(at(65), 0.9)).toBeCloseTo(1_056_641, -3)
    expect(requiredAt(at(65), 0.8)).toBeCloseTo(833_984, -3)
  })

  it('holds the projected band for a known plan', () => {
    const result = runFundingCurve(scenario(), OPTS)
    const at65 = result.points.find((p) => p.age === 65)!
    expect(at65.projected.p50).toBeCloseTo(1_441_852, -3)
    expect(at65.projected.p10).toBeCloseTo(677_106, -3)
    expect(at65.projected.p90).toBeCloseTo(2_972_361, -3)
  })

  it('holds where the curves cross', () => {
    const result = runFundingCurve(scenario(), OPTS)
    expect(crossingAge(result, 0.9, 'p50')).toBe(62)
    expect(crossingAge(result, 0.9, 'p90')).toBe(56)
  })
})

describe('crossingBand', () => {
  it('opens on the optimistic band and closes on the pessimistic one', () => {
    const result = runFundingCurve(scenario(), OPTS)
    const band = crossingBand(result, 0.9)
    expect(band.from).toBe(crossingAge(result, 0.9, 'p90'))
    expect(band.to).toBe(crossingAge(result, 0.9, 'p10'))
    if (band.from !== undefined && band.to !== undefined) {
      expect(band.from).toBeLessThanOrEqual(band.to)
    }
  })

  it('brackets the median crossing', () => {
    const result = runFundingCurve(scenario(), OPTS)
    const { from, to } = crossingBand(result, 0.9)
    const mid = crossingAge(result, 0.9, 'p50')
    if (from !== undefined && mid !== undefined) expect(from).toBeLessThanOrEqual(mid)
    if (to !== undefined && mid !== undefined) expect(to).toBeGreaterThanOrEqual(mid)
  })

  it('leaves the far end open when the pessimistic band never catches up', () => {
    const result = runFundingCurve(scenario(), OPTS)
    const band = crossingBand(result, 0.9)
    expect(band.to).toBeUndefined()
    expect(band.from).toBe(56)
  })
})

describe('fullyFundedAge', () => {
  const at = (ages: number[], needs: number[]) => ({
    points: ages.map((age, i) => ({
      age,
      requiredSorted: Array.from({ length: 11 }, () => needs[i]),
      projected: { p10: 0, p50: 0, p90: 0 },
    })),
    runCount: 11,
    retirementAge: 65,
  })

  it('finds the first age that needs no portfolio at all', () => {
    expect(fullyFundedAge(at([70, 71, 72, 73], [500, 400, 0, 0]), 0.9)).toBe(72)
  })

  it('is undefined while any portfolio is still required', () => {
    expect(fullyFundedAge(at([70, 71, 72], [500, 400, 300]), 0.9)).toBeUndefined()
  })

  it('is undefined for an empty curve', () => {
    expect(fullyFundedAge({ points: [], runCount: 0, retirementAge: 65 }, 0.9)).toBeUndefined()
  })

  it('reads the active confidence, not a fixed one', () => {
    const mixed = {
      points: [
        { age: 70, requiredSorted: [0, 0, 0, 0, 0, 0, 100, 200, 300, 400, 500], projected: { p10: 0, p50: 0, p90: 0 } },
      ],
      runCount: 11,
      retirementAge: 65,
    }
    expect(fullyFundedAge(mixed, 0.5)).toBe(70)
    expect(fullyFundedAge(mixed, 0.9)).toBeUndefined()
  })

  it('finds the age on a real plan whose guaranteed income covers the spend', () => {
    const covered = scenario({
      person: { ...scenario().person, currentAge: 62, maxAge: 74 },
      annualExpenses: 8_000,
      socialSecurity: { claimAge: 62, annualAmountPresentDollars: 90_000 },
    })
    const result = runFundingCurve(covered, { runCount: 6, maxSolveAge: 66 })
    expect(fullyFundedAge(result, 0.9)).toBe(62)
  })
})

describe('gapAt', () => {
  it('reports the shortfall between what you will have and what you need', () => {
    const result = runFundingCurve(scenario(), OPTS)
    const gap = gapAt(result, 0.9, 60)
    expect(gap).toBeDefined()
    expect(gap!.gap).toBeCloseTo(gap!.projected - gap!.needed, 6)
  })

  it('returns undefined for an age outside the solved range', () => {
    const result = runFundingCurve(scenario(), OPTS)
    expect(gapAt(result, 0.9, 200)).toBeUndefined()
  })
})
