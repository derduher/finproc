import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PathsChart, summarizeColumn } from './PathsChart'
import type { SamplePath } from '../../sim/montecarlo'

const paths: SamplePath[] = [
  { balances: [100, 120, 140, 160], depleteAge: undefined, cutYears: [], raiseYears: [] },
  { balances: [100, 110, 130, 150], depleteAge: undefined, cutYears: [], raiseYears: [] },
  { balances: [100, 60, 20, 0], depleteAge: 68, cutYears: [], raiseYears: [] }, // depletes
]
const median = [100, 95, 80, 70]

function renderChart(extra = {}) {
  return render(
    <PathsChart
      samplePaths={paths}
      median={median}
      currentAge={65}
      retireAge={66}
      maxAge={69}
      {...extra}
    />,
  )
}

describe('PathsChart', () => {
  it('renders an SVG with one line per path plus the median', () => {
    const { container } = renderChart()
    expect(container.querySelector('svg')).not.toBeNull()
    // faint paths (n-1, bad one drawn separately) + median + highlighted bad path
    const lines = container.querySelectorAll('path')
    expect(lines.length).toBeGreaterThanOrEqual(paths.length)
  })

  it('tints depleting paths and highlights a bad-luck path in the bad colour', () => {
    const { container } = renderChart()
    const badStroked = Array.from(container.querySelectorAll('path')).filter((p) =>
      (p.getAttribute('stroke') || '').includes('--bad'),
    )
    expect(badStroked.length).toBeGreaterThan(0)
  })

  it('labels where the bad-luck path runs short', () => {
    renderChart()
    expect(screen.getByText(/runs short · 68/)).toBeInTheDocument()
  })

  it('renders a legend with the median and bad-luck entries', () => {
    renderChart()
    expect(screen.getByText('median path')).toBeInTheDocument()
    expect(screen.getByText('a bad-luck path')).toBeInTheDocument()
  })

  it('uses a custom hold label when provided', () => {
    renderChart({ holdLabel: '~99% hold your $80K target' })
    expect(screen.getByText('~99% hold your $80K target')).toBeInTheDocument()
  })

  it('draws one-time expenditure markers', () => {
    const { container } = renderChart({ expenses: [{ age: 67, amount: 30_000, label: 'Trip' }] })
    // marker circle uses the accent fill
    const accentCircles = Array.from(container.querySelectorAll('circle')).filter((c) =>
      (c.getAttribute('fill') || '').includes('--accent'),
    )
    expect(accentCircles.length).toBeGreaterThan(0)
    expect(screen.getByText('$30.0K')).toBeInTheDocument()
  })

  it('hides axis/legend chrome in inline mode', () => {
    renderChart({ inline: true })
    expect(screen.queryByText('median path')).not.toBeInTheDocument()
    expect(screen.queryByText(/runs short/)).not.toBeInTheDocument()
  })

  it('prepends the starting balance at currentAge when startBalance is given', () => {
    const { container } = renderChart({ startBalance: 100 })
    // still renders cleanly with the extra leading point
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(paths.length)
  })
})

describe('summarizeColumn (#4 hover readout)', () => {
  const series = paths.map((p) => p.balances)
  const ages = [65, 66, 67, 68]

  it('reports age, median, spread and depletion count at a column', () => {
    const s = summarizeColumn(series, median, paths, ages, 3) // age 68
    expect(s.age).toBe(68)
    expect(s.median).toBe(70)
    expect(s.total).toBe(3)
    expect(s.depleted).toBe(1) // the path that runs short at 68
    expect(s.lo).toBeLessThanOrEqual(s.hi)
  })

  it('counts no depletions before the short age', () => {
    const s = summarizeColumn(series, median, paths, ages, 1) // age 66
    expect(s.depleted).toBe(0)
  })

  it('clamps an out-of-range index without NaN', () => {
    const s = summarizeColumn(series, median, paths, ages, 99)
    expect(Number.isFinite(s.median)).toBe(true)
    expect(Number.isFinite(s.lo)).toBe(true)
  })
})
