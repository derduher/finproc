import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PathStories } from './PathStories'
import type { MonteCarloResult } from '../../sim/montecarlo'

function result(over: Partial<MonteCarloResult> = {}): MonteCarloResult {
  const steady = Array.from({ length: 10 }, () => 0.06)
  const crash = [0.05, -0.3, -0.25, -0.1, 0.04, 0.05, 0.05, 0.05, 0.05, 0.05]
  return {
    yearlyResults: [],
    successRate: 0.9,
    p50EndBalance: 1_000_000,
    p10EndBalance: 0,
    p90EndBalance: 4_000_000,
    medianDepleteAge: undefined,
    samplePaths: [
      { balances: steady.map(() => 1_000_000), depleteAge: undefined, cutYears: [], raiseYears: [], returns: steady, inflation: steady.map(() => 0.03) },
      { balances: [900_000, 600_000, 300_000, 0], depleteAge: 64, cutYears: [], raiseYears: [], returns: crash, inflation: crash.map(() => 0.03) },
    ],
    shortfallByPercentile: [],
    ...over,
  }
}

describe('PathStories', () => {
  it('renders a year-by-year heading and both a typical and a bad-luck story', () => {
    render(<PathStories result={result()} currentAge={60} retireAge={62} />)
    expect(screen.getByText(/year by year/i)).toBeInTheDocument()
    expect(screen.getByText(/steady/i)).toBeInTheDocument()
    expect(screen.getByText(/runs short at age 64/i)).toBeInTheDocument()
  })

  it('renders nothing when sample paths lack per-year rate detail (legacy cache)', () => {
    const legacy = result({
      samplePaths: [{ balances: [1, 2, 3], depleteAge: undefined, cutYears: [], raiseYears: [] }],
    })
    const { container } = render(<PathStories result={legacy} currentAge={60} retireAge={62} />)
    expect(container).toBeEmptyDOMElement()
  })
})
