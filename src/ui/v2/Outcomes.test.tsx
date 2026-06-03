import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SustainableHero, RiskRead, SurplusRead, HoldChip } from './Outcomes'
import { deriveOutcomeReads } from '../../sim/outcome'
import type { MonteCarloResult } from '../../sim/montecarlo'

function reads(opts: { sustainable: number; target: number; worst10?: number; rare?: number; success?: number }) {
  const result: MonteCarloResult = {
    yearlyResults: [],
    successRate: opts.success ?? 0.99,
    p50EndBalance: 5_000_000,
    p10EndBalance: 1_300_000,
    p90EndBalance: 13_300_000,
    medianDepleteAge: undefined,
    samplePaths: [],
    shortfallByPercentile: [
      { fraction: 0.01, age: opts.rare },
      { fraction: 0.1, age: opts.worst10 },
    ],
  }
  return deriveOutcomeReads({ result, sustainable: opts.sustainable, target: opts.target, maxAge: 95 })
}

describe('SustainableHero', () => {
  it('frames an over-saver as under-spending', () => {
    render(<SustainableHero reads={reads({ sustainable: 103_000, target: 80_000 })} />)
    expect(screen.getByText(/under-spending by/i)).toBeInTheDocument()
  })

  it('frames an under-funded plan as over the sustainable level', () => {
    render(<SustainableHero reads={reads({ sustainable: 60_000, target: 80_000 })} />)
    expect(screen.getByText(/sustainable at 90%/i)).toBeInTheDocument()
  })
})

describe('RiskRead', () => {
  it('when the worst 1-in-10 stays funded, names under-living as the real risk', () => {
    render(<RiskRead reads={reads({ sustainable: 103_000, target: 80_000, worst10: undefined, rare: 79 })} />)
    expect(screen.getByText(/under-living a plan that can afford more/i)).toBeInTheDocument()
  })

  it('when the worst 1-in-10 runs short, states the magnitude + timing', () => {
    render(<RiskRead reads={reads({ sustainable: 70_000, target: 90_000, worst10: 84, rare: 78 })} />)
    expect(screen.getByText(/runs short/i)).toBeInTheDocument()
    expect(screen.getByText(/age 84/)).toBeInTheDocument()
  })
})

describe('SurplusRead + HoldChip', () => {
  it('surfaces the median surplus and the demoted hold rate', () => {
    const r = reads({ sustainable: 103_000, target: 80_000, success: 0.97 })
    render(
      <>
        <SurplusRead reads={r} />
        <HoldChip reads={r} />
      </>,
    )
    expect(screen.getByText(/left .*unspent|unspent/i)).toBeInTheDocument()
    expect(screen.getByText(/97%/)).toBeInTheDocument()
  })
})
