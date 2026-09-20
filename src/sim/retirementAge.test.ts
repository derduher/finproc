import { describe, it, expect } from 'vitest'
import { withRetirementAge } from './retirementAge'
import { defaultInputs } from '../schema'
import type { Account, SimulationInputs } from '../schema'

function acct(o: Partial<Account> & Pick<Account, 'id' | 'type'>): Account {
  return {
    name: o.id,
    balance: 100_000,
    contributionAmount: 500,
    contributionType: 'flat',
    contributionFrequency: 'monthly',
    contributionEndAge: 65,
    withdrawalStartAge: 60,
    ...o,
  } as Account
}

function scenario(): SimulationInputs {
  return {
    ...defaultInputs(),
    person: { ...defaultInputs().person, currentAge: 40, retirementAge: 65, maxAge: 90 },
    accounts: [
      acct({ id: 'brk', type: 'taxable', withdrawalStartAge: 70 }),
      acct({ id: '401k', type: 'traditional', withdrawalStartAge: 60 }),
      acct({ id: 'roth', type: 'roth', withdrawalStartAge: 60 }),
      acct({ id: 'early', type: 'traditional', withdrawalStartAge: 50 }),
    ],
  }
}

describe('withRetirementAge', () => {
  it('sets the retirement age and stops every account contributing there', () => {
    const out = withRetirementAge(scenario(), 55)
    expect(out.person.retirementAge).toBe(55)
    for (const a of out.accounts) expect(a.contributionEndAge).toBe(55)
  })

  it('moves taxable withdrawals to the retirement age and leaves tax-advantaged alone', () => {
    const out = withRetirementAge(scenario(), 55)
    expect(out.accounts.find((a) => a.id === 'brk')!.withdrawalStartAge).toBe(55)
    expect(out.accounts.find((a) => a.id === '401k')!.withdrawalStartAge).toBe(60)
    expect(out.accounts.find((a) => a.id === 'roth')!.withdrawalStartAge).toBe(60)
  })

  it('unlocks every account at the retirement age under earlyAccess', () => {
    const out = withRetirementAge(scenario(), 52, { earlyAccess: true })
    for (const a of out.accounts) expect(a.withdrawalStartAge).toBeLessThanOrEqual(52)
  })

  it('earlyAccess only ever unlocks — it never delays an account that already draws earlier', () => {
    const out = withRetirementAge(scenario(), 55, { earlyAccess: true })
    expect(out.accounts.find((a) => a.id === 'early')!.withdrawalStartAge).toBe(50)
  })

  it('leaves the original inputs untouched', () => {
    const inputs = scenario()
    withRetirementAge(inputs, 52, { earlyAccess: true })
    expect(inputs.person.retirementAge).toBe(65)
    expect(inputs.accounts.find((a) => a.id === '401k')!.withdrawalStartAge).toBe(60)
  })
})
