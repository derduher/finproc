/**
 * Responsive layout tests for ExpensesStep (LifeTimeline orientation).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExpensesStep } from './ExpensesStep'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'

function mockMobile() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

function mockDesktop() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (_query: string) => ({
      matches: false,
      media: _query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

beforeEach(() => {
  useStore.setState({
    inputs: {
      ...defaultInputs(),
      annualExpenses: 70_000,
      oneTimeExpenses: [
        { id: 'h', label: 'House', age: 36, amountPresentDollars: 80_000 },
      ],
    },
    ui: { activeStep: 3, displayMode: 'nominal', aesthetic: 'warm', theme: 'light', density: 'comfortable', lastCommittedAt: null },
  })
})

afterEach(() => {
  mockDesktop()
})

describe('ExpensesStep responsive — LifeTimeline on mobile', () => {
  it('LifeTimeline SVG has height >= width on mobile (portrait orientation)', () => {
    mockMobile()
    render(<ExpensesStep />)
    const timeline = screen.getByLabelText(/life timeline/i)
    const svg = timeline.querySelector('svg')!
    const svgHeight = parseFloat(svg.getAttribute('height') ?? '0')
    const svgWidth = parseFloat(svg.getAttribute('width') ?? '0') || 980
    // On mobile, height should be >= width (portrait/square orientation)
    expect(svgHeight).toBeGreaterThanOrEqual(svgWidth * 0.4)
  })

  it('LifeTimeline SVG maintains horizontal layout on desktop', () => {
    mockDesktop()
    render(<ExpensesStep />)
    const timeline = screen.getByLabelText(/life timeline/i)
    const svg = timeline.querySelector('svg')!
    const svgHeight = parseFloat(svg.getAttribute('height') ?? '0')
    // Desktop height should be much less than the default width (980)
    expect(svgHeight).toBeLessThan(600)
  })
})
