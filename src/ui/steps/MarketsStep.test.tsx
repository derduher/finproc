import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MarketsStep } from './MarketsStep'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'

beforeEach(() => {
  useStore.setState({
    inputs: defaultInputs(),
    ui: {
      activeStep: 2,
      displayMode: 'nominal',
      aesthetic: 'warm',
      theme: 'light',
      density: 'comfortable',
      lastCommittedAt: null,
    },
  })
})

describe('MarketsStep — design copy', () => {
  it('renders eyebrow "Step 3 of 6 · markets"', () => {
    render(<MarketsStep />)
    expect(screen.getByText(/Step 3 of 6.*markets/i)).toBeInTheDocument()
  })

  it('renders h1 "Set return and inflation assumptions"', () => {
    render(<MarketsStep />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toMatch(/return and inflation/i)
  })
})

describe('MarketsStep — breakpoints timeline', () => {
  it('renders the breakpoints timeline SVG', () => {
    render(<MarketsStep />)
    expect(screen.getByLabelText(/breakpoints timeline/i)).toBeInTheDocument()
  })

  it('renders a series toggle (growth / inflation / both)', () => {
    render(<MarketsStep />)
    expect(screen.getByRole('radio', { name: /growth/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /inflation/i })).toBeInTheDocument()
  })

  it('renders an interactive handle per breakpoint divider', () => {
    useStore.setState((s) => ({
      inputs: {
        ...s.inputs,
        breakpoints: [
          { startAge: 65, stockGrowthMin: 0.03, stockGrowthMax: 0.07, inflationMin: 0.02, inflationMax: 0.04 },
        ],
      },
    }))
    const { container } = render(<MarketsStep />)
    const handle = container.querySelector('[data-breakpoint-handle="0"]')
    expect(handle).not.toBeNull()
  })

  it('clicking the right half of a breakpoint handle shifts its startAge later', () => {
    useStore.setState((s) => ({
      inputs: {
        ...s.inputs,
        breakpoints: [
          { startAge: 65, stockGrowthMin: 0.03, stockGrowthMax: 0.07, inflationMin: 0.02, inflationMax: 0.04 },
        ],
      },
    }))
    const { container } = render(<MarketsStep />)
    const right = container.querySelector('[data-breakpoint-handle="0"][data-direction="right"]') as SVGRectElement | null
    expect(right).not.toBeNull()
    fireEvent.click(right!)
    expect(useStore.getState().inputs.breakpoints[0].startAge).toBe(66)
  })

  it('clicking the left half of a breakpoint handle shifts its startAge earlier', () => {
    useStore.setState((s) => ({
      inputs: {
        ...s.inputs,
        breakpoints: [
          { startAge: 65, stockGrowthMin: 0.03, stockGrowthMax: 0.07, inflationMin: 0.02, inflationMax: 0.04 },
        ],
      },
    }))
    const { container } = render(<MarketsStep />)
    const left = container.querySelector('[data-breakpoint-handle="0"][data-direction="left"]') as SVGRectElement | null
    expect(left).not.toBeNull()
    fireEvent.click(left!)
    expect(useStore.getState().inputs.breakpoints[0].startAge).toBe(64)
  })
})

describe('MarketsStep — segment cards', () => {
  it('renders at least one segment card (initial segment)', () => {
    render(<MarketsStep />)
    expect(screen.getByText(/segment 1/i)).toBeInTheDocument()
  })

  it('renders an "+ add breakpoint" affordance', () => {
    render(<MarketsStep />)
    expect(screen.getByText(/add breakpoint/i)).toBeInTheDocument()
  })

  it('renders an additional segment card for each breakpoint', () => {
    useStore.setState((s) => ({
      inputs: {
        ...s.inputs,
        breakpoints: [
          { startAge: 65, stockGrowthMin: 0.03, stockGrowthMax: 0.07, inflationMin: 0.02, inflationMax: 0.04 },
        ],
      },
    }))
    render(<MarketsStep />)
    expect(screen.getByText(/segment 2/i)).toBeInTheDocument()
  })
})

describe('MarketsStep — historical defaults preset', () => {
  it('renders a "historical defaults" button', () => {
    render(<MarketsStep />)
    expect(screen.getByRole('button', { name: /historical defaults/i })).toBeInTheDocument()
  })

  it('clicking it applies the historical nominal return/inflation bands to the initial segment', () => {
    render(<MarketsStep />)
    fireEvent.click(screen.getByRole('button', { name: /historical defaults/i }))
    const inputs = useStore.getState().inputs
    // Nominal stock growth ~4.4%–13.5% (median ~9%), inflation ~-1.5%–8.75%.
    expect(inputs.initialStockGrowthMin).toBeCloseTo(0.044, 4)
    expect(inputs.initialStockGrowthMax).toBeCloseTo(0.135, 4)
    expect(inputs.initialInflationMin).toBeCloseTo(-0.015, 4)
    expect(inputs.initialInflationMax).toBeCloseTo(0.0875, 4)
  })
})

describe('MarketsStep — simplifications note', () => {
  it('renders the Monte Carlo simplification note', () => {
    render(<MarketsStep />)
    expect(screen.getByText(/Monte Carlo simplification/i)).toBeInTheDocument()
  })
})
