import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HiCashflow } from './HiCashflow'
import type { MonteCarloYearlyResult } from '../../sim/montecarlo'

// Real Monte Carlo output starts at currentAge + 1 (each row is a year-END state).
// Contributions run up to and including the retirement-year-end bar; withdrawals
// begin the year after.
function makeData(currentAge: number, retireAge: number, ssAge: number, maxAge: number): MonteCarloYearlyResult[] {
  const results: MonteCarloYearlyResult[] = []
  for (let age = currentAge + 1; age <= maxAge; age++) {
    results.push({
      age,
      p10: 100_000,
      p50: 500_000,
      p90: 1_000_000,
      contributionsMedian: age <= retireAge ? 12_000 : 0,
      socialSecurityMedian: age > ssAge ? 24_000 : 0,
      withdrawalsMedian: age > retireAge ? 70_000 : 0,
    })
  }
  return results
}

describe('HiCashflow', () => {
  const currentAge = 32
  const data = makeData(currentAge, 62, 67, 95)

  it('renders an SVG element', () => {
    const { container } = render(<HiCashflow data={data} currentAge={currentAge} retireAge={62} ssAge={67} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders contribution bars for working years (33..62 inclusive = 30 bars)', () => {
    const { container } = render(<HiCashflow data={data} currentAge={currentAge} retireAge={62} ssAge={67} />)
    const contribBars = container.querySelectorAll('[data-bar="contribution"]')
    expect(contribBars.length).toBe(30)
  })

  it('renders SS bars starting after ssAge (68..95 = 28 bars)', () => {
    const { container } = render(<HiCashflow data={data} currentAge={currentAge} retireAge={62} ssAge={67} />)
    const ssBars = container.querySelectorAll('[data-bar="ss"]')
    expect(ssBars.length).toBe(28)
  })

  it('renders withdrawal bars after retireAge (63..95 = 33 bars)', () => {
    const { container } = render(<HiCashflow data={data} currentAge={currentAge} retireAge={62} ssAge={67} />)
    const wdBars = container.querySelectorAll('[data-bar="withdrawal"]')
    expect(wdBars.length).toBe(33)
  })

  it('aligns the retire marker with the right edge of the last contribution bar', () => {
    const { container } = render(<HiCashflow data={data} currentAge={currentAge} retireAge={62} ssAge={67} />)
    const marker = container.querySelector('line[data-marker="retire"]') as SVGLineElement
    const contribBars = Array.from(
      container.querySelectorAll('[data-bar="contribution"]'),
    ) as SVGRectElement[]
    // Last contribution bar is the year ending at retireAge.
    const last = contribBars[contribBars.length - 1]
    const lastRightEdge = Number(last.getAttribute('x')) + Number(last.getAttribute('width'))
    const markerX = Number(marker.getAttribute('x1'))
    // The marker should sit at (or within a px of) the right edge of the last bar,
    // i.e. contributions stop exactly at retirement — not one year past it.
    expect(Math.abs(markerX - lastRightEdge)).toBeLessThanOrEqual(2)
  })

  it('positions the first withdrawal bar starting at the retire marker', () => {
    const { container } = render(<HiCashflow data={data} currentAge={currentAge} retireAge={62} ssAge={67} />)
    const marker = container.querySelector('line[data-marker="retire"]') as SVGLineElement
    const wdBars = Array.from(
      container.querySelectorAll('[data-bar="withdrawal"]'),
    ) as SVGRectElement[]
    const firstWd = wdBars[0]
    const markerX = Number(marker.getAttribute('x1'))
    expect(Math.abs(Number(firstWd.getAttribute('x')) - markerX)).toBeLessThanOrEqual(2)
  })

  it('legend has contributions label', () => {
    render(<HiCashflow data={data} currentAge={currentAge} retireAge={62} ssAge={67} />)
    expect(screen.getByText(/contributions/i)).toBeInTheDocument()
  })

  it('legend has Social Security label', () => {
    render(<HiCashflow data={data} currentAge={currentAge} retireAge={62} ssAge={67} />)
    expect(screen.getByText(/soc/i)).toBeInTheDocument()
  })

  it('legend has withdrawals label', () => {
    render(<HiCashflow data={data} currentAge={currentAge} retireAge={62} ssAge={67} />)
    expect(screen.getByText(/withdrawals/i)).toBeInTheDocument()
  })

  it('renders a retire vertical marker line', () => {
    const { container } = render(<HiCashflow data={data} currentAge={currentAge} retireAge={62} ssAge={67} />)
    const lines = container.querySelectorAll('line[data-marker="retire"]')
    expect(lines.length).toBe(1)
  })
})
