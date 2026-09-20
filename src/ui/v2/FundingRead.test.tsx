import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FundingRead } from './FundingRead'
import { fundingCaption, fundingHorizonNote } from './fundingNarrative'
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

/** Guaranteed income covers the spend from age 62 on. */
function coveredCurve(): FundingCurveResult {
  const points: FundingCurvePoint[] = []
  for (let age = 55; age <= 70; age++) {
    points.push({
      age,
      requiredSorted: Array.from({ length: 11 }, () => (age < 62 ? 400_000 : 0)),
      projected: { p10: 1_000_000, p50: 2_000_000, p90: 3_000_000 },
    })
  }
  return { points, runCount: 11, retirementAge: 65 }
}

describe('fundingHorizonNote', () => {
  it('says the plan has no single end date under a varying lifespan', () => {
    const note = fundingHorizonNote({
      firstAge: 39,
      lastSolvedAge: 80,
      planMaxAge: 100,
      longevity: 'stochastic',
    })
    expect(note).toMatch(/39 to 80/)
    expect(note).toMatch(/varies/i)
    expect(note).not.toMatch(/100/)
  })

  it('names the plan end when the curve stops short of it', () => {
    const note = fundingHorizonNote({
      firstAge: 45,
      lastSolvedAge: 80,
      planMaxAge: 95,
      longevity: 'fixed',
    })
    expect(note).toMatch(/45 to 80/)
    expect(note).toMatch(/runs to 95/)
  })

  it('says so when the curve already reaches the end of the plan', () => {
    const note = fundingHorizonNote({
      firstAge: 70,
      lastSolvedAge: 79,
      planMaxAge: 80,
      longevity: 'fixed',
    })
    expect(note).toMatch(/to the end of your plan/)
    expect(note).not.toMatch(/runs to/)
  })
})

describe('fundingCaption — fully funded', () => {
  it('names the age where guaranteed income takes over', () => {
    const text = fundingCaption({
      curve: coveredCurve(),
      confidence: 0.9,
      earliestAge: 60,
      planRetirementAge: 65,
    })
    expect(text).toMatch(/From 62 you'd need no portfolio at all/)
  })

  it('says nothing about it when a portfolio is always required', () => {
    const text = fundingCaption({
      curve: curve(),
      confidence: 0.9,
      earliestAge: 66,
      planRetirementAge: 65,
    })
    expect(text).not.toMatch(/no portfolio/)
  })
})

describe('FundingRead', () => {
  const base = {
    confidence: 0.9,
    loading: false,
    stale: false,
    planRetirementAge: 65,
    planMaxAge: 95,
    longevity: 'fixed' as const,
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

  it('states the solved range and where the plan ends', () => {
    render(<FundingRead {...base} curve={curve()} />)
    expect(screen.getByText(/50 to 70/)).toBeTruthy()
    expect(screen.getByText(/runs to 95/)).toBeTruthy()
  })

  it('states that the lifespan varies instead of naming an end age', () => {
    render(<FundingRead {...base} longevity="stochastic" planMaxAge={100} curve={curve()} />)
    expect(screen.getByText(/varies/i)).toBeTruthy()
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
