import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FundingRead } from './FundingRead'
import { fundingCaption } from './fundingNarrative'
import type { FundingCurvePoint, FundingCurveResult } from '../../sim/fundingCurve'

function point(age: number, need: number, p50: number): FundingCurvePoint {
  return {
    age,
    requiredSorted: Array.from({ length: 11 }, (_, i) => need * (0.7 + i * 0.06)),
    projected: { p10: p50 * 0.6, p50, p90: p50 * 1.4 },
  }
}

/** Requirement falls, projection rises — crosses in the low 60s. */
function curve(): FundingCurveResult {
  const points: FundingCurvePoint[] = []
  for (let age = 50; age <= 70; age++) {
    points.push(point(age, 2_000_000 - (age - 50) * 40_000, 600_000 + (age - 50) * 80_000))
  }
  return { points, runCount: 11, retirementAge: 65 }
}

function brokeCurve(): FundingCurveResult {
  const points: FundingCurvePoint[] = []
  for (let age = 50; age <= 70; age++) points.push(point(age, 3_000_000, 200_000))
  return { points, runCount: 11, retirementAge: 65 }
}

/** Already funded at the first solved age. */
function fundedCurve(): FundingCurveResult {
  const points: FundingCurvePoint[] = []
  for (let age = 50; age <= 70; age++) points.push(point(age, 100_000, 9_000_000))
  return { points, runCount: 11, retirementAge: 65 }
}

describe('fundingCaption', () => {
  it('names the solver age when it disagrees with the crossing', () => {
    const text = fundingCaption({
      curve: curve(),
      confidence: 0.9,
      earliestAge: 66,
      planRetirementAge: 65,
    })
    expect(text).toMatch(/flatters you/)
    expect(text).toMatch(/66/)
  })

  it('says so when the crossing and the solver agree', () => {
    const c = curve()
    const cross = c.points.find((p) => p.projected.p50 >= p.requiredSorted[9])!.age
    const text = fundingCaption({
      curve: c,
      confidence: 0.9,
      earliestAge: cross,
      planRetirementAge: 65,
    })
    expect(text).toMatch(/matches the 90% answer/)
  })

  it('warns that markets must be average when the solver found no age', () => {
    const text = fundingCaption({ curve: curve(), confidence: 0.9, planRetirementAge: 65 })
    expect(text).toMatch(/about average/)
  })

  it('quotes the shortfall at the plan retirement age when the lines never meet', () => {
    const text = fundingCaption({
      curve: brokeCurve(),
      confidence: 0.9,
      earliestAge: undefined,
      planRetirementAge: 65,
    })
    expect(text).toMatch(/At 65 you're projected to have/)
    expect(text).toMatch(/short/)
  })

  it('falls back to the last solved age when the plan retires past the window', () => {
    const text = fundingCaption({
      curve: brokeCurve(),
      confidence: 0.9,
      planRetirementAge: 92,
    })
    expect(text).toMatch(/At 70 you're projected to have/)
  })

  it('reports being already funded', () => {
    const text = fundingCaption({ curve: fundedCurve(), confidence: 0.9, planRetirementAge: 65 })
    expect(text).toMatch(/already above the line/)
  })

  it('returns nothing for an empty curve', () => {
    expect(
      fundingCaption({
        curve: { points: [], runCount: 0, retirementAge: 65 },
        confidence: 0.9,
        planRetirementAge: 65,
      }),
    ).toBe('')
  })
})

describe('FundingRead', () => {
  const base = {
    confidence: 0.9,
    loading: false,
    stale: false,
    planRetirementAge: 65,
    width: 800,
  }

  it('renders the chart and its caption once the curve lands', () => {
    render(<FundingRead {...base} curve={curve()} earliestAge={66} />)
    expect(screen.getByRole('heading', { name: /what you need vs what you'll have/i })).toBeTruthy()
    expect(screen.getByText(/flatters you/)).toBeTruthy()
  })

  it('names the active confidence in the standfirst', () => {
    render(<FundingRead {...base} confidence={0.75} curve={curve()} />)
    expect(screen.getByText(/75% confidence/)).toBeTruthy()
  })

  it('shows solve progress before the first curve arrives', () => {
    render(<FundingRead {...base} curve={null} loading progress={{ done: 7, total: 30 }} />)
    expect(screen.getByRole('status').textContent).toMatch(/7 of 30/)
  })

  it('shows a plain wait message when progress has not reported yet', () => {
    render(<FundingRead {...base} curve={null} loading />)
    expect(screen.getByRole('status').textContent).toMatch(/Working out what each age costs/)
  })

  it('prompts for a plan when there is nothing to solve', () => {
    render(<FundingRead {...base} curve={null} />)
    expect(screen.getByRole('status').textContent).toMatch(/Add a plan/)
  })

  it('dims a stale curve instead of blanking the section', () => {
    const { container } = render(<FundingRead {...base} curve={curve()} stale />)
    expect(container.querySelector('svg')).not.toBeNull()
    const dimmed = Array.from(container.querySelectorAll('div')).some(
      (d) => d.style.opacity === '0.55',
    )
    expect(dimmed).toBe(true)
  })
})
