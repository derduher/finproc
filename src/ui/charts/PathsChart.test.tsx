import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PathsChart, summarizeColumn, pathYearDetail, tooltipBoxPosition } from './PathsChart'
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
  it('sizes the axis to the longest series, not the first path (stochastic longevity)', () => {
    // Under stochastic longevity sample paths have different lengths — the first
    // run may die early. The chart must extend to the longest series (here the
    // median + a long path reach age 71), not truncate to the first path (age 67).
    const variablePaths: SamplePath[] = [
      { balances: [100, 90], depleteAge: undefined, cutYears: [], raiseYears: [] }, // died early
      { balances: [100, 95, 80, 70, 60, 50], depleteAge: undefined, cutYears: [], raiseYears: [] },
    ]
    const longMedian = [100, 95, 85, 75, 65, 55]
    const { container } = render(
      <PathsChart samplePaths={variablePaths} median={longMedian} currentAge={65} retireAge={66} maxAge={68} />,
    )
    const labels = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    // Right-edge tick reaches the real last age (65 + 6 = 71), beyond the plan-to age.
    expect(labels).toContain('71')
  })

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

describe('tooltipBoxPosition (#2 keep the readout inside the plot)', () => {
  const pad = { l: 58, t: 16 }
  const cw = 900
  const ch = 310

  it('places the box to the right of the hover point when there is room', () => {
    const { bx, by } = tooltipBoxPosition(400, 184, 120, pad, cw, ch)
    expect(bx).toBe(412) // hx + 12
    expect(by).toBe(pad.t + 8)
  })

  it('clamps the box so it never overflows the right edge', () => {
    const { bx } = tooltipBoxPosition(940, 184, 120, pad, cw, ch)
    expect(bx + 184).toBeLessThanOrEqual(pad.l + cw)
  })

  it('clamps a tall box so its bottom stays inside the plot area', () => {
    const tallH = 305 // taller than the 8px top offset allows, but still fits the plot
    const { by } = tooltipBoxPosition(400, 184, tallH, pad, cw, ch)
    expect(by).toBeLessThan(pad.t + 8) // pulled up from the default top offset
    expect(by).toBeGreaterThanOrEqual(pad.t)
    expect(by + tallH).toBeLessThanOrEqual(pad.t + ch + 0.0001)
  })

  it('keeps the left/top edges inside even when the box is wider/taller than the plot', () => {
    const { bx, by } = tooltipBoxPosition(940, 2000, 2000, pad, cw, ch)
    expect(bx).toBeGreaterThanOrEqual(pad.l)
    expect(by).toBeGreaterThanOrEqual(pad.t)
  })
})

describe('pathYearDetail (year-by-year hover)', () => {
  const path: SamplePath = {
    balances: [120, 90, 60],
    depleteAge: undefined,
    cutYears: [67],
    raiseYears: [],
    returns: [0.05, -0.2, 0.1],
    inflation: [0.02, 0.04, 0.03],
  }
  // returns[i] is the year ending at age currentAge + i + 1 (currentAge = 65).

  it('reads the drivers for the year ending at the hovered age', () => {
    const d = pathYearDetail(path, 67, 65) // idx 1 → the -20% year
    expect(d.balance).toBe(90)
    expect(d.stockReturn).toBeCloseTo(-0.2)
    expect(d.inflation).toBeCloseTo(0.04)
    expect(d.cut).toBe(true)
    expect(d.raise).toBe(false)
  })

  it('returns undefined drivers outside the path range', () => {
    const d = pathYearDetail(path, 65, 65) // the prepended start age, no year yet
    expect(d.balance).toBeUndefined()
    expect(d.stockReturn).toBeUndefined()
  })

  it('tolerates a path with no rate detail (legacy cached results)', () => {
    const bare: SamplePath = { balances: [120, 90], depleteAge: undefined, cutYears: [], raiseYears: [] }
    const d = pathYearDetail(bare, 66, 65)
    expect(d.balance).toBe(120)
    expect(d.stockReturn).toBeUndefined()
  })
})

describe('PathsChart crisis overlay', () => {
  it('draws an overlay line and a legend entry when given one', () => {
    const { container } = renderChart({
      overlay: { label: 'if 2008 repeated', balances: [100, 70, 75, 80], tone: 'accent' },
    })
    expect(screen.getByText('if 2008 repeated')).toBeInTheDocument()
    // The overlay path uses the accent stroke.
    const accentPaths = Array.from(container.querySelectorAll('path')).filter((p) =>
      (p.getAttribute('stroke') || '').includes('--accent'),
    )
    expect(accentPaths.length).toBeGreaterThan(0)
  })
})
