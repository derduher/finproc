import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HiCashflow } from './HiCashflow'
import type { MonteCarloYearlyResult } from '../../sim/montecarlo'

function makeData(currentAge: number, retireAge: number, ssAge: number, maxAge: number): MonteCarloYearlyResult[] {
  const results: MonteCarloYearlyResult[] = []
  for (let age = currentAge; age <= maxAge; age++) {
    results.push({
      age,
      p10: 100_000,
      p50: 500_000,
      p90: 1_000_000,
      contributionsMedian: age < retireAge ? 12_000 : 0,
      socialSecurityMedian: age >= ssAge ? 24_000 : 0,
      withdrawalsMedian: age >= retireAge ? 70_000 : 0,
    })
  }
  return results
}

describe('HiCashflow', () => {
  const data = makeData(32, 62, 67, 95)

  it('renders an SVG element', () => {
    const { container } = render(<HiCashflow data={data} retireAge={62} ssAge={67} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders contribution bars for pre-retirement years', () => {
    const { container } = render(<HiCashflow data={data} retireAge={62} ssAge={67} />)
    const contribBars = container.querySelectorAll('[data-bar="contribution"]')
    expect(contribBars.length).toBeGreaterThan(0)
    // Years 32..61 have contributions = 30 bars
    expect(contribBars.length).toBe(30)
  })

  it('renders SS bars starting from ssAge', () => {
    const { container } = render(<HiCashflow data={data} retireAge={62} ssAge={67} />)
    const ssBars = container.querySelectorAll('[data-bar="ss"]')
    // Years 67..95 = 29 years
    expect(ssBars.length).toBe(29)
  })

  it('renders withdrawal bars from retireAge onward', () => {
    const { container } = render(<HiCashflow data={data} retireAge={62} ssAge={67} />)
    const wdBars = container.querySelectorAll('[data-bar="withdrawal"]')
    // Years 62..95 = 34 years
    expect(wdBars.length).toBe(34)
  })

  it('legend has contributions label', () => {
    render(<HiCashflow data={data} retireAge={62} ssAge={67} />)
    expect(screen.getByText(/contributions/i)).toBeInTheDocument()
  })

  it('legend has Social Security label', () => {
    render(<HiCashflow data={data} retireAge={62} ssAge={67} />)
    expect(screen.getByText(/soc/i)).toBeInTheDocument()
  })

  it('legend has withdrawals label', () => {
    render(<HiCashflow data={data} retireAge={62} ssAge={67} />)
    expect(screen.getByText(/withdrawals/i)).toBeInTheDocument()
  })

  it('renders a retire vertical marker line', () => {
    const { container } = render(<HiCashflow data={data} retireAge={62} ssAge={67} />)
    const lines = container.querySelectorAll('line[data-marker="retire"]')
    expect(lines.length).toBe(1)
  })
})
