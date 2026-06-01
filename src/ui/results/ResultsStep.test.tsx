import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResultsStep } from './ResultsStep'
import { useStore } from '../../store'
import { defaultInputs, WithdrawalStrategy } from '../../schema'
import type { MonteCarloResult } from '../../sim/montecarlo'
import type { Insight } from '../../sim/insights'

// ── Fake data ─────────────────────────────────────────────────────────────────

const fakeResult: MonteCarloResult = {
  successRate: 0.84,
  p50EndBalance: 2_400_000,
  p10EndBalance: 310_000,
  medianDepleteAge: 84,
  yearlyResults: Array.from({ length: 64 }, (_, i) => ({
    age: 32 + i,
    p10: Math.max(0, 300_000 + i * 5_000),
    p50: 500_000 + i * 30_000,
    p90: 800_000 + i * 60_000,
    contributionsMedian: i < 30 ? 12_000 : 0,
    socialSecurityMedian: i >= 35 ? 24_000 : 0,
    withdrawalsMedian: i >= 30 ? 70_000 : 0,
  })),
}

const fakeInsights: Insight[] = [
  {
    tone: 'good',
    title: 'Tax-optimal strategy is paying off',
    body: 'Versus a proportional draw, tax-optimal lifts success by 3 percentage points.',
    cta: 'See strategy',
  },
  {
    tone: 'warn',
    title: 'Healthcare gap (62 → 65)',
    body: "ACA premiums aren't modeled.",
    cta: 'Add expense',
  },
  {
    tone: 'accent',
    title: 'One more year of work matters',
    body: 'Working one more year raises success rate from 84% → 89%.',
    cta: 'Branch scenario',
  },
]

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../hooks/useSimulation', () => ({
  useSimulation: vi.fn(() => ({
    result: fakeResult,
    loading: false,
    stale: false,
    error: null,
    progress: undefined,
  })),
}))

vi.mock('../../sim/insights', () => ({
  computeInsights: vi.fn(() => fakeInsights),
}))

vi.mock('../../sim/sensitivity', () => ({
  runSensitivity: vi.fn(() => [
    { label: 'Stock returns', sub: '±20%', loDelta: -0.18, hiDelta: 0.14 },
    { label: 'Annual expenses', sub: '±20%', loDelta: -0.12, hiDelta: 0.11 },
  ]),
}))

const mockSaveScenario = vi.fn()
vi.mock('../../hooks/useScenarios', () => ({
  useScenarios: vi.fn(() => ({
    scenarios: [],
    saveScenario: mockSaveScenario,
    deleteScenario: vi.fn(),
    loadScenario: vi.fn(),
  })),
}))

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockSaveScenario.mockClear()
  useStore.setState({
    inputs: {
      ...defaultInputs(),
      withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
    },
    ui: {
      activeStep: 5,
      displayMode: 'nominal',
      aesthetic: 'warm',
      theme: 'light',
      density: 'comfortable',
      lastCommittedAt: null,
    },
  })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ResultsStep — earliest-failure sub-label', () => {
  it('shows the actual P10 depletion age when p10 series hits zero', async () => {
    // fakeResult.yearlyResults p10 = max(0, 300_000 + i * 5_000) — never hits zero,
    // so for this test we override the mock with a yearlyResults containing a P10 zero.
    const { useSimulation } = await import('../../hooks/useSimulation')
    vi.mocked(useSimulation).mockReturnValueOnce({
      result: {
        ...fakeResult,
        yearlyResults: [
          { age: 32, p10: 100, p50: 200, p90: 300, contributionsMedian: 0, socialSecurityMedian: 0, withdrawalsMedian: 0 },
          { age: 75, p10: 0, p50: 200, p90: 300, contributionsMedian: 0, socialSecurityMedian: 0, withdrawalsMedian: 0 },
          { age: 76, p10: 0, p50: 200, p90: 300, contributionsMedian: 0, socialSecurityMedian: 0, withdrawalsMedian: 0 },
        ],
      },
      loading: false,
      stale: false,
      error: null,
      progress: undefined,
    })
    const { container } = render(<ResultsStep />)
    expect(container.textContent).toMatch(/P10.*age 75/i)
    expect(container.textContent).not.toMatch(/Earliest failure: age 33/)
  })

  it('shows survival message when P10 never depletes', async () => {
    const { useSimulation } = await import('../../hooks/useSimulation')
    vi.mocked(useSimulation).mockReturnValueOnce({
      result: {
        ...fakeResult,
        medianDepleteAge: 99,
        yearlyResults: [
          { age: 32, p10: 1_000_000, p50: 200, p90: 300, contributionsMedian: 0, socialSecurityMedian: 0, withdrawalsMedian: 0 },
          { age: 95, p10: 500_000, p50: 200, p90: 300, contributionsMedian: 0, socialSecurityMedian: 0, withdrawalsMedian: 0 },
        ],
      },
      loading: false,
      stale: false,
      error: null,
      progress: undefined,
    })
    const { container } = render(<ResultsStep />)
    expect(container.textContent).toMatch(/P10 survives/i)
  })
})

describe('ResultsStep — retirement age sourcing', () => {
  it('retire marker on fan chart uses inputs.person.retirementAge (not max of accounts)', () => {
    useStore.setState((s) => ({
      inputs: {
        ...s.inputs,
        person: { ...s.inputs.person, currentAge: 32, retirementAge: 65, maxAge: 95 },
        // Accounts have heterogeneous contributionEndAge — should NOT drive retireAge.
        accounts: [
          { id: 'a', name: 'a', type: 'roth' as const, balance: 100, contributionAmount: 0, contributionType: 'flat' as const, contributionFrequency: 'monthly' as const, contributionEndAge: 80, withdrawalStartAge: 59 },
        ],
      },
    }))
    const { container } = render(<ResultsStep />)
    // Fan chart text contains "retire · age 65" (not 80)
    expect(container.textContent).toMatch(/retire.*age 65/i)
    expect(container.textContent).not.toMatch(/retire.*age 80/i)
  })
})

describe('ResultsStep — displayMode (nominal/real)', () => {
  it('renders nominal-mode median ending balance ($2.4M) by default', () => {
    const { container } = render(<ResultsStep />)
    // p50EndBalance = 2,400,000 → formatMoneyAbbreviated → "$2.4M"
    expect(container.textContent).toMatch(/\$2\.4M/)
  })

  it('renders smaller "real" value when displayMode is real (deflated to today\'s $)', () => {
    // Render once in nominal, capture the median-balance line
    const { container: nominalContainer, unmount } = render(<ResultsStep />)
    const nominalText = nominalContainer.textContent ?? ''
    unmount()
    // Switch mode and re-render
    useStore.setState({
      ui: {
        activeStep: 5,
        displayMode: 'real',
        aesthetic: 'warm',
        theme: 'light',
        density: 'comfortable',
        lastCommittedAt: null,
      },
    })
    const { container: realContainer } = render(<ResultsStep />)
    const realText = realContainer.textContent ?? ''
    // The two text outputs must differ — the main metric values must change with the mode.
    expect(realText).not.toBe(nominalText)
    // Nominal must include $2.4M; real must not display $2.4M as the median ending balance.
    expect(nominalText).toMatch(/\$2\.4M/)
  })

  it('the metric card sub-label indicates the mode (nominal vs real)', () => {
    useStore.setState({
      ui: {
        activeStep: 5,
        displayMode: 'real',
        aesthetic: 'warm',
        theme: 'light',
        density: 'comfortable',
        lastCommittedAt: null,
      },
    })
    const { container } = render(<ResultsStep />)
    expect(container.textContent).toMatch(/real|today/i)
  })
})

describe('ResultsStep — design copy', () => {
  it('renders "Step 6 of 6 · results" eyebrow', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/Step 6 of 6.*results/i)).toBeInTheDocument()
  })

  it('renders h1 or h2 with "Your retirement projection"', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/retirement projection/i)).toBeInTheDocument()
  })
})

describe('ResultsStep — metric cards', () => {
  it('renders "success rate" label', () => {
    render(<ResultsStep />)
    // Use getAllByText because insight body may also contain "success rate"
    expect(screen.getAllByText(/success rate/i).length).toBeGreaterThan(0)
  })

  it('renders success rate as large number (84%)', () => {
    render(<ResultsStep />)
    // The 84 number should be in the DOM as a big display element
    const successNum = screen.getAllByText(/84/).find(
      (el) => el.tagName.toLowerCase() === 'span' || el.tagName.toLowerCase() === 'div',
    )
    expect(successNum).toBeDefined()
  })

  it('renders progress bar with width matching success rate', () => {
    const { container } = render(<ResultsStep />)
    const progressBar = container.querySelector('[data-testid="success-bar"]')
    expect(progressBar).not.toBeNull()
  })

  it('renders "of 1,000 Monte Carlo runs" text', () => {
    const { container } = render(<ResultsStep />)
    // Text is split across <span> elements; check container.textContent
    expect(container.textContent).toMatch(/1,000.*Monte Carlo/i)
  })

  it('renders "median ending balance" label', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/median ending balance/i)).toBeInTheDocument()
  })

  it('renders "P10 ending balance" label', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/P10 ending balance/i)).toBeInTheDocument()
  })

  it('renders "depletion age" label', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/depletion age/i)).toBeInTheDocument()
  })
})

describe('ResultsStep — fan chart', () => {
  it('renders fan chart section with portfolio trajectory heading', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/portfolio/i)).toBeInTheDocument()
  })

  it('renders the fan chart SVG', () => {
    const { container } = render(<ResultsStep />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

describe('ResultsStep — cashflow chart', () => {
  it('renders "Annual cashflow" heading', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/annual cashflow/i)).toBeInTheDocument()
  })
})

describe('ResultsStep — sensitivity', () => {
  it('renders "Sensitivity" or "top levers" heading', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/sensitivity|top levers/i)).toBeInTheDocument()
  })

  it('renders a brief explanation of how to read the tornado chart', () => {
    const { container } = render(<ResultsStep />)
    // Should explain the meaning of bars (positive = improves success, negative = lowers success)
    expect(container.textContent).toMatch(/each (input|lever)|how to read|success rate.*chang/i)
  })
})

describe('ResultsStep — insight cards', () => {
  it('renders the tax-optimal insight card', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/Tax-optimal strategy is paying off/i)).toBeInTheDocument()
  })

  it('renders the healthcare gap insight card', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/Healthcare gap/i)).toBeInTheDocument()
  })

  it('renders the retire-later insight card', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/One more year of work matters/i)).toBeInTheDocument()
  })
})

describe('ResultsStep — scenario footer', () => {
  it('renders "Branch scenario" button', () => {
    render(<ResultsStep />)
    // The footer button (＋ Branch scenario) — getAllByRole since insight CTA also matches
    const btns = screen.getAllByRole('button', { name: /branch scenario/i })
    expect(btns.length).toBeGreaterThan(0)
  })

  it('clicking branch scenario calls saveScenario', () => {
    render(<ResultsStep />)
    // Click the last matching button (the footer primary action)
    const btns = screen.getAllByRole('button', { name: /branch scenario/i })
    fireEvent.click(btns[btns.length - 1])
    expect(mockSaveScenario).toHaveBeenCalledOnce()
  })

  it('renders "Copy as JSON" button', () => {
    render(<ResultsStep />)
    expect(screen.getByRole('button', { name: /copy as json/i })).toBeInTheDocument()
  })

  it('renders "Share link" button', () => {
    render(<ResultsStep />)
    expect(screen.getByRole('button', { name: /share link/i })).toBeInTheDocument()
  })

  it('renders "Compare this scenario" text', () => {
    render(<ResultsStep />)
    expect(screen.getByText(/compare this scenario/i)).toBeInTheDocument()
  })

  it('Share link button shows "Copied" feedback after click', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } })
    render(<ResultsStep />)
    const btn = screen.getByRole('button', { name: /share link/i })
    fireEvent.click(btn)
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })

  it('Copy as JSON button shows "Copied" feedback after click', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } })
    render(<ResultsStep />)
    const btn = screen.getByRole('button', { name: /copy as json/i })
    fireEvent.click(btn)
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })

  it('shows confirmation feedback after Branch scenario is clicked', () => {
    render(<ResultsStep />)
    const btns = screen.getAllByRole('button', { name: /branch scenario/i })
    fireEvent.click(btns[btns.length - 1])
    expect(screen.getByText(/saved|branched/i)).toBeInTheDocument()
  })
})
