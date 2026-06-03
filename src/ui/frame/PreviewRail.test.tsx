import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreviewRail } from './PreviewRail'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'
import type { MonteCarloResult } from '../../sim/montecarlo'

const MOCK_RESULT: MonteCarloResult = {
  yearlyResults: [
    { age: 33, p10: 100_000, p50: 110_000, p90: 130_000, contributionsMedian: 14_000, socialSecurityMedian: 0, withdrawalsMedian: 0 },
    { age: 34, p10: 110_000, p50: 130_000, p90: 160_000, contributionsMedian: 14_000, socialSecurityMedian: 0, withdrawalsMedian: 0 },
  ],
  successRate: 0.84,
  p50EndBalance: 2_400_000,
  p10EndBalance: 310_000,
  medianDepleteAge: undefined,
  p90EndBalance: 0,
  samplePaths: [],
  shortfallByPercentile: [],
}

vi.mock('../../hooks/useSimulation', () => ({
  useSimulation: vi.fn(),
}))

beforeEach(() => {
  useStore.setState({
    inputs: defaultInputs(),
    ui: {
      activeStep: 0,
      displayMode: 'nominal',
      aesthetic: 'warm',
      theme: 'light',
      density: 'comfortable',
      lastCommittedAt: null,
    },
  })
})

afterEach(() => vi.clearAllMocks())

describe('PreviewRail — live success rate', () => {
  it('renders the success% from useSimulation', async () => {
    const { useSimulation } = await import('../../hooks/useSimulation')
    vi.mocked(useSimulation).mockReturnValue({
      result: MOCK_RESULT, loading: false, stale: false, error: null, progress: undefined,
    })
    render(<PreviewRail />)
    expect(screen.getByText(/84/)).toBeInTheDocument()
  })

  it('renders the fresh badge when not stale', async () => {
    const { useSimulation } = await import('../../hooks/useSimulation')
    vi.mocked(useSimulation).mockReturnValue({
      result: MOCK_RESULT, loading: false, stale: false, error: null, progress: undefined,
    })
    render(<PreviewRail />)
    expect(screen.getByText(/fresh/i)).toBeInTheDocument()
  })

  it('renders the recomputing badge when stale', async () => {
    const { useSimulation } = await import('../../hooks/useSimulation')
    vi.mocked(useSimulation).mockReturnValue({
      result: MOCK_RESULT, loading: false, stale: true, error: null, progress: undefined,
    })
    render(<PreviewRail />)
    expect(screen.getByText(/recomputing/i)).toBeInTheDocument()
  })

  it('shows a placeholder while result is null', async () => {
    const { useSimulation } = await import('../../hooks/useSimulation')
    vi.mocked(useSimulation).mockReturnValue({
      result: null, loading: true, stale: false, error: null, progress: undefined,
    })
    render(<PreviewRail />)
    expect(screen.getByText(/live preview/i)).toBeInTheDocument()
  })
})

describe('PreviewRail — metrics', () => {
  it('renders median and p10 metrics', async () => {
    const { useSimulation } = await import('../../hooks/useSimulation')
    vi.mocked(useSimulation).mockReturnValue({
      result: MOCK_RESULT, loading: false, stale: false, error: null, progress: undefined,
    })
    render(<PreviewRail />)
    // Use the .label elements (lowercase "median" / "p10") to avoid matching
    // the SVG chart's "P50/P10/P90" annotation text.
    const labels = Array.from(document.querySelectorAll('.label')).map((n) => n.textContent)
    expect(labels).toEqual(expect.arrayContaining(['median', 'p10']))
  })
})
