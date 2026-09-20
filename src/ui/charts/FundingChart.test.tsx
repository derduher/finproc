import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { FundingChart, fundingYCap, nearestPointIndex } from './FundingChart'
import type { FundingCurvePoint, FundingCurveResult } from '../../sim/fundingCurve'

function point(age: number, need: number, p50: number, spread = 0.4): FundingCurvePoint {
  return {
    age,
    // 11 entries so requiredAt's nearest-rank lands on round confidences.
    requiredSorted: Array.from({ length: 11 }, (_, i) => need * (0.7 + i * 0.06)),
    projected: { p10: p50 * (1 - spread), p50, p90: p50 * (1 + spread) },
  }
}

/** Requirement falls, projection rises, crossing around 60. */
function curve(overrides: Partial<FundingCurveResult> = {}): FundingCurveResult {
  const points: FundingCurvePoint[] = []
  for (let age = 50; age <= 70; age++) {
    points.push(point(age, 2_000_000 - (age - 50) * 40_000, 600_000 + (age - 50) * 80_000))
  }
  return { points, runCount: 11, retirementAge: 65, ...overrides }
}

/** Never catches up — the underfunded state. */
function brokeCurve(): FundingCurveResult {
  const points: FundingCurvePoint[] = []
  for (let age = 50; age <= 70; age++) points.push(point(age, 3_000_000, 200_000))
  return { points, runCount: 11, retirementAge: 65 }
}

const paths = (c: HTMLElement) => Array.from(c.querySelectorAll('path'))
const polys = (c: HTMLElement) => Array.from(c.querySelectorAll('polygon'))
const texts = (c: HTMLElement) => Array.from(c.querySelectorAll('text')).map((t) => t.textContent)

describe('fundingYCap', () => {
  it('always leaves headroom above the tallest requirement', () => {
    const c = curve()
    const cap = fundingYCap(c.points, 0.9)
    const tallest = Math.max(...c.points.map((p) => p.requiredSorted[9]))
    expect(cap).toBeGreaterThanOrEqual(tallest)
  })

  it('ignores the optimistic band entirely, so a lucky tail cannot squash the chart', () => {
    const c = curve()
    const before = fundingYCap(c.points, 0.9)
    for (const p of c.points) p.projected.p90 *= 100
    expect(fundingYCap(c.points, 0.9)).toBe(before)
  })

  it('keeps the crossing in frame rather than scaling to the far-right median', () => {
    // Real shape: a modest requirement the median eventually runs far past.
    const points: FundingCurvePoint[] = []
    for (let age = 45; age <= 80; age++) {
      points.push(point(age, 1_900_000 - (age - 45) * 30_000, 430_000 + (age - 45) * 90_000))
    }
    const needMax = Math.max(...points.map((p) => p.requiredSorted[9]))
    const medianMax = Math.max(...points.map((p) => p.projected.p50))
    const cap = fundingYCap(points, 0.9)
    expect(cap).toBeGreaterThan(needMax)
    // The median runs off the top rather than flattening everything below it.
    expect(cap).toBeLessThan(medianMax)
  })

  it('keeps the requirement readable when the median runs away from it', () => {
    // A well-funded plan: modest requirement, median ending 10x higher. Scaling
    // to the median would smear the requirement along the axis.
    const points: FundingCurvePoint[] = []
    for (let age = 39; age <= 80; age++) {
      points.push(point(age, 1_550_000 - (age - 39) * 34_000, 2_200_000 + (age - 39) * 400_000))
    }
    const needMax = Math.max(...points.map((p) => p.requiredSorted[9]))
    const cap = fundingYCap(points, 0.9)
    expect(needMax / cap).toBeGreaterThanOrEqual(0.35)
    expect(cap).toBeGreaterThan(needMax)
  })

  it('still lets the median set the axis when it does not bury the requirement', () => {
    // Median tops out a few times the requirement, not ten times: inside the
    // window, so the median is what the axis follows.
    const points: FundingCurvePoint[] = []
    for (let age = 45; age <= 80; age++) {
      points.push(point(age, 800_000 - (age - 45) * 12_000, 430_000 + (age - 45) * 80_000))
    }
    const medians = points.map((p) => p.projected.p50).sort((a, b) => a - b)
    const p75 = medians[Math.floor(medians.length * 0.75)]
    expect(fundingYCap(points, 0.9)).toBe(p75)
  })

  it('gives the axis to the median when nothing is required at all', () => {
    const points: FundingCurvePoint[] = []
    for (let age = 60; age <= 70; age++) points.push(point(age, 0, 500_000))
    expect(fundingYCap(points, 0.9)).toBe(500_000)
  })

  it('never returns zero for a degenerate curve', () => {
    expect(fundingYCap([], 0.9)).toBe(1)
    expect(fundingYCap([point(60, 0, 0)], 0.9)).toBe(1)
  })
})

describe('nearestPointIndex', () => {
  it('maps an age onto its point', () => {
    const c = curve()
    expect(nearestPointIndex(c.points, 50)).toBe(0)
    expect(nearestPointIndex(c.points, 60.4)).toBe(10)
  })

  it('clamps outside the solved range and handles an empty curve', () => {
    const c = curve()
    expect(nearestPointIndex(c.points, 10)).toBe(0)
    expect(nearestPointIndex(c.points, 200)).toBe(c.points.length - 1)
    expect(nearestPointIndex([], 60)).toBeNull()
  })
})

describe('FundingChart', () => {
  it('draws both curves and the projection band', () => {
    const { container } = render(<FundingChart result={curve()} confidence={0.9} />)
    expect(paths(container).some((p) => p.getAttribute('stroke') === 'var(--accent)')).toBe(true)
    expect(paths(container).some((p) => p.getAttribute('stroke') === 'var(--good)')).toBe(true)
    expect(polys(container).some((p) => p.getAttribute('fill') === 'var(--good)')).toBe(true)
  })

  it('draws a ghost line for each reference confidence', () => {
    const { container } = render(<FundingChart result={curve()} confidence={0.9} />)
    const ghosts = paths(container).filter((p) => p.getAttribute('stroke-dasharray') === '4 4')
    expect(ghosts).toHaveLength(2)
  })

  it('marks the solver age separately from the visual crossing', () => {
    const { container } = render(
      <FundingChart result={curve()} confidence={0.9} earliestAge={64} />,
    )
    expect(texts(container)).toContain('earliest age · 64')
    expect(
      Array.from(container.querySelectorAll('line')).some(
        (l) => l.getAttribute('stroke-dasharray') === '5 4',
      ),
    ).toBe(true)
  })

  it('omits the marker when the solver found no age', () => {
    const { container } = render(<FundingChart result={curve()} confidence={0.9} />)
    expect(texts(container).some((t) => t?.startsWith('earliest age'))).toBe(false)
  })

  it('omits the marker when the solver age falls outside the drawn range', () => {
    const { container } = render(
      <FundingChart result={curve()} confidence={0.9} earliestAge={88} />,
    )
    expect(texts(container).some((t) => t?.startsWith('earliest age'))).toBe(false)
  })

  it('shades the shortfall only when the plan never catches up', () => {
    const healthy = render(<FundingChart result={curve()} confidence={0.9} />)
    expect(polys(healthy.container).some((p) => p.getAttribute('fill') === 'var(--bad)')).toBe(false)

    const broke = render(<FundingChart result={brokeCurve()} confidence={0.9} />)
    expect(polys(broke.container).some((p) => p.getAttribute('fill') === 'var(--bad)')).toBe(true)
  })

  it('names the active confidence in the legend', () => {
    const { container } = render(<FundingChart result={curve()} confidence={0.8} />)
    expect(texts(container)).toContain('needed at 80%')
  })

  it('shortens the legend at phone width so it stays inside the plot', () => {
    const wide = render(<FundingChart result={curve()} confidence={0.9} width={1000} />)
    expect(texts(wide.container)).toContain('projected if you work to that age')

    const narrow = render(<FundingChart result={curve()} confidence={0.9} width={375} />)
    expect(texts(narrow.container)).toContain('projected')
    expect(texts(narrow.container)).not.toContain('projected if you work to that age')
  })

  it('renders an empty frame rather than NaN coordinates for an empty curve', () => {
    const { container } = render(
      <FundingChart result={{ points: [], runCount: 0, retirementAge: 65 }} confidence={0.9} />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
    expect(paths(container)).toHaveLength(0)
  })

  it('reads out needed, projected and the gap on hover', () => {
    const { container } = render(<FundingChart result={curve()} confidence={0.9} />)
    const plot = container.querySelectorAll('rect')
    const target = plot[plot.length - 1]
    // jsdom reports a zero-width rect, which the scrub guard rejects.
    target.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 380 }) as DOMRect

    fireEvent.pointerMove(target, { clientX: 0 })
    const labels = texts(container)
    expect(labels).toContain('age 50')
    expect(labels).toContain('needed')
    expect(labels).toContain('projected')
    expect(labels).toContain('short by')
  })

  it('reports a surplus once the projection is ahead', () => {
    const { container } = render(<FundingChart result={curve()} confidence={0.9} />)
    const plot = container.querySelectorAll('rect')
    const target = plot[plot.length - 1]
    target.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 380 }) as DOMRect

    fireEvent.pointerMove(target, { clientX: 1000 })
    expect(texts(container)).toContain('age 70')
    expect(texts(container)).toContain('surplus')
  })

  it('clears the readout when the pointer leaves', () => {
    const { container } = render(<FundingChart result={curve()} confidence={0.9} />)
    const plot = container.querySelectorAll('rect')
    const target = plot[plot.length - 1]
    target.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 380 }) as DOMRect

    fireEvent.pointerMove(target, { clientX: 500 })
    expect(texts(container).some((t) => t?.startsWith('age '))).toBe(true)
    fireEvent.pointerLeave(target)
    expect(texts(container).some((t) => t?.startsWith('age '))).toBe(false)
  })
})
