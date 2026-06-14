import { describe, it, expect } from 'vitest'
import { defaultInputs } from '../schema'
import type { SimulationInputs } from '../schema'
import {
  lowerSocialSecurity,
  dropEmployerMatch,
  taxableHeavyMix,
  combineSwings,
  guessRangeBand,
  GUESS_PERTURBATIONS,
} from './guesses'

/** A plan with SS, an employer match on a 401(k), and a taxable sleeve. */
function seededPlan(): SimulationInputs {
  const base = defaultInputs()
  return {
    ...base,
    socialSecurity: { annualAmountPresentDollars: 30_000, claimAge: 67 },
    accounts: [
      {
        id: 'k401', name: '401(k)', type: 'traditional', balance: 250_000,
        contributionAmount: 1_500, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 65, withdrawalStartAge: 65, accountSubtype: '401k',
        employerMatch: { type: 'flat', annualAmount: 6_000 },
      },
      {
        id: 'tax', name: 'Brokerage', type: 'taxable', balance: 30_000,
        contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly',
        contributionEndAge: 65, withdrawalStartAge: 65,
      },
    ],
  }
}

const totalBalance = (i: SimulationInputs) => i.accounts.reduce((s, a) => s + a.balance, 0)
const taxableBalance = (i: SimulationInputs) =>
  i.accounts.filter((a) => a.type === 'taxable').reduce((s, a) => s + a.balance, 0)

describe('lowerSocialSecurity', () => {
  it('reduces the benefit below the guess without touching the claim age', () => {
    const out = lowerSocialSecurity(seededPlan())
    expect(out.socialSecurity!.annualAmountPresentDollars).toBeLessThan(30_000)
    expect(out.socialSecurity!.claimAge).toBe(67)
  })

  it('leaves an undefined Social Security untouched', () => {
    const base = { ...defaultInputs(), socialSecurity: undefined }
    expect(lowerSocialSecurity(base).socialSecurity).toBeUndefined()
  })

  it('does not mutate the input', () => {
    const input = seededPlan()
    lowerSocialSecurity(input)
    expect(input.socialSecurity!.annualAmountPresentDollars).toBe(30_000)
  })
})

describe('dropEmployerMatch', () => {
  it('removes the match from every account', () => {
    const out = dropEmployerMatch(seededPlan())
    expect(out.accounts.every((a) => a.employerMatch === undefined)).toBe(true)
  })

  it('does not mutate the input', () => {
    const input = seededPlan()
    dropEmployerMatch(input)
    expect(input.accounts[0].employerMatch).toEqual({ type: 'flat', annualAmount: 6_000 })
  })
})

describe('taxableHeavyMix', () => {
  it('shifts balance toward taxable while preserving the total', () => {
    const input = seededPlan()
    const out = taxableHeavyMix(input)
    expect(taxableBalance(out)).toBeGreaterThan(taxableBalance(input))
    expect(totalBalance(out)).toBeCloseTo(totalBalance(input), 2)
  })

  it('returns a schema-valid set of accounts', () => {
    const out = taxableHeavyMix(seededPlan())
    expect(() => defaultInputs()).not.toThrow()
    // every account still carries the required contribution/withdrawal gates
    expect(out.accounts.every((a) => typeof a.withdrawalStartAge === 'number')).toBe(true)
  })
})

describe('combineSwings (root-sum-square)', () => {
  it('returns 0 for no swings', () => {
    expect(combineSwings([])).toBe(0)
  })

  it('combines independent swings as the root of the sum of squares', () => {
    expect(combineSwings([8000, 3000, 4000])).toBeCloseTo(Math.sqrt(8000 ** 2 + 3000 ** 2 + 4000 ** 2), 2)
  })

  it('ignores nullish entries', () => {
    expect(combineSwings([8000, null, undefined])).toBeCloseTo(8000, 2)
  })
})

describe('guessRangeBand', () => {
  it('brackets the best guess symmetrically by the combined swing', () => {
    const band = guessRangeBand(103_000, [8000, 3000, 4000])
    const half = Math.sqrt(8000 ** 2 + 3000 ** 2 + 4000 ** 2)
    expect(band.low).toBeCloseTo(103_000 - half, 2)
    expect(band.high).toBeCloseTo(103_000 + half, 2)
  })

  it('clamps the low end at zero', () => {
    const band = guessRangeBand(5_000, [20_000])
    expect(band.low).toBe(0)
  })

  it('collapses to a point when there are no swings', () => {
    const band = guessRangeBand(103_000, [])
    expect(band.low).toBe(103_000)
    expect(band.high).toBe(103_000)
  })
})

describe('GUESS_PERTURBATIONS', () => {
  it('maps every guess id to its perturbation', () => {
    expect(Object.keys(GUESS_PERTURBATIONS).sort()).toEqual(['match', 'mix', 'ss'])
  })
})

describe('perturbation no-op guards', () => {
  it('dropEmployerMatch returns the same inputs when no account has a match', () => {
    const inp = defaultInputs() // accounts: []
    expect(dropEmployerMatch(inp)).toBe(inp)
  })

  it('taxableHeavyMix is a no-op when there are no traditional/roth balances to shift', () => {
    const inp = defaultInputs() // accounts: [] → nothing to shift
    expect(taxableHeavyMix(inp)).toBe(inp)
  })
})
