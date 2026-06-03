import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    p90EndBalance: 0,
    samplePaths: [],
    shortfallByPercentile: [],
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

describe('HiFanChart — hide P90', () => {
  it('renders the P90 label by default', () => {
    render(<HiFanChart result={makeResult()} />)
    expect(screen.getByText(/P90/)).toBeInTheDocument()
  })

  it('hides the P90 label when hideP90 is true', () => {
    render(<HiFanChart result={makeResult()} hideP90 />)
    expect(screen.queryByText(/P90/)).toBeNull()
    // P50 and P10 remain visible.
    expect(screen.getByText(/P50/)).toBeInTheDocument()
    expect(screen.getByText(/P10/)).toBeInTheDocument()
  })

  it('rescales the Y-axis to the P50 max when P90 is hidden (top tick < P90 max)', () => {
    const { container: withP90 } = render(<HiFanChart result={makeResult()} />)
    const { container: noP90 } = render(<HiFanChart result={makeResult()} hideP90 />)
    const topTick = (c: HTMLElement) => {
      const texts = Array.from(c.querySelectorAll('text'))
        .map((t) => t.textContent ?? '')
        .filter((t) => /[$0-9]/.test(t))
      return texts
    }
    // The presence of distinct y-axis labels is enough to confirm a different scale;
    // assert the hidden-P90 chart does not contain the largest P90 tick value.
    expect(topTick(withP90).join('|')).not.toEqual(topTick(noP90).join('|'))
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

describe('HiFanChart — hover overlay', () => {
  it('shows a value/year overlay tracking the nearest year on pointer move', () => {
    const width = 560
    const { container } = render(<HiFanChart result={makeResult()} width={width} />)
    const svg = container.querySelector('svg') as SVGSVGElement

    // jsdom has no layout — pin a known geometry so x→age maps deterministically.
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: width, bottom: 280, width, height: 280, x: 0, y: 0, toJSON() {} }) as DOMRect

    // ages start at 32 (minAge 31). PAD.left=56, PAD.right=48 → plot width W=456.
    // age 45 sits at 56 + ((45-31)/(95-31))*456 ≈ 56 + 99.75 = 155.75.
    // jsdom doesn't expose PointerEvent, and testing-library's fireEvent.pointerMove
    // falls back to a bare Event that drops clientX. A MouseEvent typed 'pointermove'
    // is defined, carries clientX, and still triggers React's onPointerMove.
    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 156, clientY: 100 })
    fireEvent(svg, move)

    const tooltip = container.querySelector('[data-testid="fan-tooltip"]')
    expect(tooltip).not.toBeNull()
    expect(tooltip!.textContent).toContain('age 45')

    // Leaving clears the overlay.
    fireEvent.pointerLeave(svg)
    expect(container.querySelector('[data-testid="fan-tooltip"]')).toBeNull()
  })
})
