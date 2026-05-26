import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Frame } from './Frame'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'
import type { MonteCarloResult } from '../../sim/montecarlo'

const MOCK_RESULT: MonteCarloResult = {
  yearlyResults: [
    { age: 33, p10: 100_000, p50: 110_000, p90: 130_000, contributionsMedian: 14_000, socialSecurityMedian: 0, withdrawalsMedian: 0 },
  ],
  successRate: 0.84,
  p50EndBalance: 2_400_000,
  p10EndBalance: 310_000,
  medianDepleteAge: undefined,
}

vi.mock('../../hooks/useSimulation', () => ({
  useSimulation: vi.fn(() => ({ result: MOCK_RESULT, loading: false, stale: false, error: null })),
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

describe('Frame — root data attributes', () => {
  it('applies data-aesthetic and data-theme from the store', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, aesthetic: 'cool', theme: 'dark' } }))
    const { container } = render(<Frame><div>x</div></Frame>)
    const root = container.querySelector('.hf')!
    expect(root.getAttribute('data-aesthetic')).toBe('cool')
    expect(root.getAttribute('data-theme')).toBe('dark')
  })

  it('applies data-density', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, density: 'compact' } }))
    const { container } = render(<Frame><div>x</div></Frame>)
    const root = container.querySelector('.hf')!
    expect(root.getAttribute('data-density')).toBe('compact')
  })
})

describe('Frame — footer buttons', () => {
  it('step 0 shows only Continue (no Back)', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 0 } }))
    render(<Frame><div>x</div></Frame>)
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^back/i })).toBeNull()
  })

  it('step 1-4 shows Back, Save & exit, Continue', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 2 } }))
    render(<Frame><div>x</div></Frame>)
    const footer = screen.getByLabelText('Desktop wizard footer')
    expect(footer.textContent).toMatch(/Back/)
    expect(footer.textContent).toMatch(/Save & exit/)
    expect(footer.textContent).toMatch(/Continue/)
  })

  it('step 5 (results) shows Edit strategy and Save scenario', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 5 } }))
    render(<Frame wide><div>x</div></Frame>)
    expect(screen.getByRole('button', { name: /edit strategy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save scenario/i })).toBeInTheDocument()
  })

  it('Continue advances activeStep', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 1 } }))
    render(<Frame><div>x</div></Frame>)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(useStore.getState().ui.activeStep).toBe(2)
  })

  it('desktop footer Back retreats activeStep', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 3 } }))
    render(<Frame><div>x</div></Frame>)
    const footer = screen.getByLabelText('Desktop wizard footer')
    const backBtn = Array.from(footer.querySelectorAll('button')).find((b) =>
      b.textContent?.match(/Back/),
    ) as HTMLButtonElement
    fireEvent.click(backBtn)
    expect(useStore.getState().ui.activeStep).toBe(2)
  })

  it('Save & exit returns to step 0 (exit the wizard mid-flow)', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 3 } }))
    render(<Frame><div>x</div></Frame>)
    fireEvent.click(screen.getByRole('button', { name: /save & exit/i }))
    expect(useStore.getState().ui.activeStep).toBe(0)
  })

  it('results-footer Save scenario calls useScenarios.saveScenario with current inputs', () => {
    mockSaveScenario.mockClear()
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 5 } }))
    render(<Frame wide><div>x</div></Frame>)
    fireEvent.click(screen.getByRole('button', { name: /save scenario/i }))
    expect(mockSaveScenario).toHaveBeenCalledTimes(1)
    // saveScenario(name, inputs)
    expect(mockSaveScenario).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ scenarioName: expect.any(String) }),
    )
  })
})

describe('Frame — PreviewRail slot', () => {
  it('renders PreviewRail on input steps', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 0 } }))
    render(<Frame><div>x</div></Frame>)
    expect(screen.getByLabelText(/live simulation preview/i)).toBeInTheDocument()
  })

  it('hides PreviewRail when wide (results step)', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 5 } }))
    render(<Frame wide><div>x</div></Frame>)
    expect(screen.queryByLabelText(/live simulation preview/i)).toBeNull()
  })
})

describe('Frame — responsive shell (CSS-driven)', () => {
  it('renders a mobile header element in the DOM (hidden by CSS on desktop)', () => {
    render(<Frame><div>x</div></Frame>)
    // The mobile header is always in the DOM — visibility is controlled via CSS
    expect(screen.getByLabelText(/mobile wizard nav/i)).toBeInTheDocument()
  })

  it('mobile header carries .shell-mobile-only class', () => {
    const { container } = render(<Frame><div>x</div></Frame>)
    const mobileHeader = container.querySelector('header[aria-label="Mobile wizard nav"]')
    expect(mobileHeader?.className).toMatch(/shell-mobile-only/)
  })

  it('desktop chrome (TopBar) carries .shell-desktop-only class', () => {
    const { container } = render(<Frame><div>x</div></Frame>)
    const topBar = container.querySelector('[aria-label="Top toolbar"]')
    expect(topBar?.className).toMatch(/shell-desktop-only/)
  })

  it('StepRail and PreviewRail carry .shell-desktop-only', () => {
    const { container } = render(<Frame><div>x</div></Frame>)
    const stepRail = container.querySelector('nav[aria-label="Wizard steps"]')
    const preview = container.querySelector('aside[aria-label="Live simulation preview"]')
    expect(stepRail?.className).toMatch(/shell-desktop-only/)
    expect(preview?.className).toMatch(/shell-desktop-only/)
  })

  it('mobile header Next button advances activeStep', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 1 } }))
    const { container } = render(<Frame><div>x</div></Frame>)
    const mobileHeader = container.querySelector('header[aria-label="Mobile wizard nav"]')!
    const nextBtn = mobileHeader.querySelector('button[data-action="next"]') as HTMLButtonElement
    nextBtn.click()
    expect(useStore.getState().ui.activeStep).toBe(2)
  })

  it('mobile header back button retreats activeStep', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 3 } }))
    const { container } = render(<Frame><div>x</div></Frame>)
    const mobileHeader = container.querySelector('header[aria-label="Mobile wizard nav"]')!
    const backBtn = mobileHeader.querySelector('button[data-action="back"]') as HTMLButtonElement
    backBtn.click()
    expect(useStore.getState().ui.activeStep).toBe(2)
  })

  it('mobile header shows the active step title and step indicator', () => {
    useStore.setState((s) => ({ ui: { ...s.ui, activeStep: 2 } }))
    const { container } = render(<Frame><div>x</div></Frame>)
    const mobileHeader = container.querySelector('header[aria-label="Mobile wizard nav"]')!
    expect(mobileHeader.textContent).toMatch(/Markets/)
    expect(mobileHeader.textContent).toMatch(/3 of 6/)
  })
})
