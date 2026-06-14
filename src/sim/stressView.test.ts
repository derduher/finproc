import { describe, it, expect } from 'vitest'
import { toScenarioView } from './stressView'
import type { HistoricalScenarioResult } from './historical'

const base: HistoricalScenarioResult = {
  scenario: { id: 'x', name: 'X', startYear: 2008, blurb: '' },
  anchorAge: 65,
  balances: [100, 60, 80],
  realBalances: [98, 55, 70],
  rates: [],
  survived: true,
  depleteAge: undefined,
  troughBalance: 60,
  troughAge: 66,
  endBalance: 80,
}

describe('toScenarioView', () => {
  it('uses nominal balances and recomputes the trough in nominal mode', () => {
    const v = toScenarioView(base, 'nominal', 65)
    expect(v.balances).toEqual([100, 60, 80])
    expect(v.troughBalance).toBe(60)
    expect(v.troughAge).toBe(67)
    expect(v.endBalance).toBe(80)
  })

  it('uses deflated balances and recomputes the trough in real mode', () => {
    const v = toScenarioView(base, 'real', 65)
    expect(v.balances).toEqual([98, 55, 70])
    expect(v.troughBalance).toBe(55)
    expect(v.troughAge).toBe(67)
    expect(v.endBalance).toBe(70)
  })

  it('ignores the low accumulation balance and reports the retirement-phase trough', () => {
    // currentAge 60, anchor 65. ages: 61..67 → only 65,66,67 count.
    const res: HistoricalScenarioResult = {
      ...base,
      anchorAge: 65,
      balances: [10, 20, 30, 40, 50, 25, 30],
      realBalances: [10, 20, 30, 40, 50, 25, 30],
    }
    const v = toScenarioView(res, 'nominal', 60)
    expect(v.troughBalance).toBe(25) // age 66, not the pre-retirement 10
    expect(v.troughAge).toBe(66)
  })

  it('falls back to the last balance when no age reaches the anchor', () => {
    // anchorAge 99 is past every age in the series, so the forEach never sets a
    // trough → troughBalance stays Infinity and falls back to the last balance.
    const res: HistoricalScenarioResult = { ...base, anchorAge: 99 }
    const v = toScenarioView(res, 'nominal', 65)
    expect(v.troughBalance).toBe(80) // last balance, not Infinity
    expect(v.troughAge).toBe(99) // unchanged anchor
  })

  it('handles an empty balance series without producing Infinity/undefined', () => {
    const res: HistoricalScenarioResult = {
      ...base,
      balances: [],
      realBalances: [],
    }
    const v = toScenarioView(res, 'nominal', 65)
    expect(v.troughBalance).toBe(0)
    expect(v.endBalance).toBe(0)
  })

  it('carries survival fields through unchanged', () => {
    const v = toScenarioView({ ...base, survived: false, depleteAge: 70 }, 'nominal', 65)
    expect(v.survived).toBe(false)
    expect(v.depleteAge).toBe(70)
  })
})
