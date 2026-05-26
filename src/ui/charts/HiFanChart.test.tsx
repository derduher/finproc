import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HiFanChart } from './HiFanChart'
import type { MonteCarloResult } from '../../sim/montecarlo'

function makeResult(overrides: Partial<MonteCarloResult> = {}): MonteCarloResult {
  const yearlyResults = Array.from({ length: 64 }, (_, i) => ({
    age: 32 + i,
    p10: Math.max(0, 300_000 + i * 5_000),
    p50: 500_000 + i * 30_000,
    p90: 800_000 + i * 60_000,
    contributionsMedian: i < 30 ? 12_000 : 0,
    socialSecurityMedian: i >= 35 ? 24_000 : 0,
    withdrawalsMedian: i >= 30 ? 70_000 : 0,
  }))
  return {
    successRate: 0.84,
    p50EndBalance: 2_400_000,
    p10EndBalance: 310_000,
    medianDepleteAge: undefined,
    yearlyResults,
    ...overrides,
  }
}

describe('HiFanChart — basic render', () => {
  it('renders an SVG', () => {
    const { container } = render(<HiFanChart result={makeResult()} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders P90 label', () => {
    render(<HiFanChart result={makeResult()} />)
    expect(screen.getByText(/P90/)).toBeInTheDocument()
  })

  it('renders P50 label', () => {
    render(<HiFanChart result={makeResult()} />)
    expect(screen.getByText(/P50/)).toBeInTheDocument()
  })

  it('renders P10 label', () => {
    render(<HiFanChart result={makeResult()} />)
    expect(screen.getByText(/P10/)).toBeInTheDocument()
  })
})

describe('HiFanChart — retire marker', () => {
  it('renders retire age marker when retireAge is in range', () => {
    render(<HiFanChart result={makeResult()} retireAge={62} />)
    expect(screen.getByText(/retire/i)).toBeInTheDocument()
  })

  it('does not render retire marker when retireAge is out of range', () => {
    render(<HiFanChart result={makeResult()} retireAge={10} />)
    expect(screen.queryByText(/retire/i)).toBeNull()
  })

  it('retire marker shows age number', () => {
    render(<HiFanChart result={makeResult()} retireAge={62} />)
    // Text "retire · age 62" is the marker; use a specific pattern
    expect(screen.getByText(/retire.*62/i)).toBeInTheDocument()
  })
})

describe('HiFanChart — depletion marker', () => {
  it('renders depletion marker when depleted=true', () => {
    render(<HiFanChart result={makeResult()} depleted depleteAge={78} />)
    expect(screen.getByText(/depleted/i)).toBeInTheDocument()
  })

  it('depletion marker shows the depleteAge', () => {
    render(<HiFanChart result={makeResult()} depleted depleteAge={78} />)
    expect(screen.getByText(/78/)).toBeInTheDocument()
  })

  it('does not render depletion marker when depleted is false', () => {
    render(<HiFanChart result={makeResult()} depleted={false} depleteAge={78} />)
    expect(screen.queryByText(/depleted/i)).toBeNull()
  })
})
