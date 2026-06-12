import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SustainableHero, RiskRead, SurplusRead, HoldChip, SpendFloorNote } from './Outcomes'
import { deriveOutcomeReads } from '../../sim/outcome'
import type { MonteCarloResult } from '../../sim/montecarlo'

function reads(opts: { sustainable: number; target: number; worst10?: number; rare?: number; success?: number; retireAge?: number; maxAge?: number }) {
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
  return deriveOutcomeReads({
    result,
    sustainable: opts.sustainable,
    target: opts.target,
    maxAge: opts.maxAge ?? 95,
    retireAge: opts.retireAge ?? 65,
  })
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

  it('scopes the figure to retirement with the covered age range', () => {
    render(<SustainableHero reads={reads({ sustainable: 90_000, target: 80_000, retireAge: 65, maxAge: 95 })} />)
    expect(screen.getByText(/in retirement/i)).toBeInTheDocument()
    expect(screen.getByText(/from age 65 to 95/i)).toBeInTheDocument()
  })

  it('explains what "sustain" means in plain terms', () => {
    render(<SustainableHero reads={reads({ sustainable: 90_000, target: 80_000 })} />)
    expect(screen.getByText(/9 in 10/i)).toBeInTheDocument()
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

describe('SpendFloorNote', () => {
  it('shows the worst-1-in-10 spending cut when guardrails are active and the floor is below 1', () => {
    render(<SpendFloorNote guardrails spendFloorP10={0.81} />)
    expect(screen.getByText(/spending floor/i)).toBeInTheDocument()
    // 0.81 floor → cut of about 19%.
    expect(screen.getByText(/19%/)).toBeInTheDocument()
  })

  it('renders nothing under the flat policy', () => {
    const { container } = render(<SpendFloorNote guardrails={false} spendFloorP10={0.81} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when no run ever cut spending (floor = 1) or on legacy results', () => {
    const a = render(<SpendFloorNote guardrails spendFloorP10={1} />)
    expect(a.container).toBeEmptyDOMElement()
    const b = render(<SpendFloorNote guardrails spendFloorP10={undefined} />)
    expect(b.container).toBeEmptyDOMElement()
  })
})
