import { describe, it, expect, vi } from 'vitest'
import { simulate } from './simulator'
import { defaultInputs, WithdrawalStrategy } from '../schema'
import type { ProgressEvent } from './simulator'

const BASE_INPUTS = {
  ...defaultInputs(),
  person: { ...defaultInputs().person, currentAge: 62, maxAge: 70, marginalTaxRate: 0 },
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

describe('simulate — progress events', () => {
  it('emits parse → sample → project → aggregate in order', async () => {
    const onProgress = vi.fn<(p: ProgressEvent) => void>()
    await simulate(BASE_INPUTS, 20, onProgress)

    const stages = onProgress.mock.calls.map(([p]) => p.stage)
    const firstIdx = (s: string) => stages.indexOf(s)
    expect(firstIdx('parse')).toBeGreaterThanOrEqual(0)
    expect(firstIdx('sample')).toBeGreaterThan(firstIdx('parse'))
    expect(firstIdx('project')).toBeGreaterThan(firstIdx('sample'))
    expect(firstIdx('aggregate')).toBeGreaterThan(firstIdx('project'))
  })

  it('progress.done is monotonically non-decreasing within a stage', async () => {
    const events: ProgressEvent[] = []
    await simulate(BASE_INPUTS, 50, (p) => events.push(p))

    const projectEvents = events.filter((e) => e.stage === 'project')
    for (let i = 1; i < projectEvents.length; i++) {
      expect(projectEvents[i].done).toBeGreaterThanOrEqual(projectEvents[i - 1].done)
    }
  })

  it('final aggregate event has done === total', async () => {
    const events: ProgressEvent[] = []
    await simulate(BASE_INPUTS, 20, (p) => events.push(p))
    const last = events.at(-1)!
    expect(last.stage).toBe('aggregate')
    expect(last.done).toBe(last.total)
  })

  it('works without onProgress callback (back-compat)', async () => {
    const result = await simulate(BASE_INPUTS, 10)
    expect(result.successRate).toBeGreaterThanOrEqual(0)
  })
})
