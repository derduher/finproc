/**
 * Responsive layout tests for ResultsStep.
 *
 * Uses CSS @media (max-width: 768px) — no JS-side viewport check in the
 * component. Tests assert (a) the data attribute is on the right element,
 * (b) inline grid-template-columns is NOT set (CSS-driven), and (c) the
 * CSS rule exists in styles.css.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ResultsStep } from './ResultsStep'
import { useStore } from '../../store'
import { defaultInputs, WithdrawalStrategy } from '../../schema'
import type { MonteCarloResult } from '../../sim/montecarlo'

const css = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf-8')

const fakeResult: MonteCarloResult = {
  successRate: 0.84,
  p50EndBalance: 2_400_000,
  p10EndBalance: 310_000,
  medianDepleteAge: undefined,
  yearlyResults: Array.from({ length: 64 }, (_, i) => ({
    age: 32 + i,
    p10: 300_000 + i * 5_000,
    p50: 500_000 + i * 30_000,
    p90: 800_000 + i * 60_000,
    contributionsMedian: i < 30 ? 12_000 : 0,
    socialSecurityMedian: i >= 35 ? 24_000 : 0,
    withdrawalsMedian: i >= 30 ? 70_000 : 0,
  })),
}

vi.mock('../../hooks/useSimulation', () => ({
  useSimulation: vi.fn(() => ({ result: fakeResult, loading: false, stale: false, error: null, progress: undefined })),
}))
vi.mock('../../sim/insights', () => ({ computeInsights: vi.fn(() => []) }))
vi.mock('../../sim/sensitivity', () => ({ runSensitivity: vi.fn(() => []) }))
vi.mock('../../hooks/useScenarios', () => ({ useScenarios: vi.fn(() => ({ scenarios: [], saveScenario: vi.fn(), deleteScenario: vi.fn(), loadScenario: vi.fn() })) }))

beforeEach(() => {
  useStore.setState({
    inputs: { ...defaultInputs(), withdrawalStrategy: WithdrawalStrategy.TaxOptimal },
    ui: { activeStep: 5, displayMode: 'nominal', aesthetic: 'warm', theme: 'light', density: 'comfortable', lastCommittedAt: null },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ResultsStep responsive — CSS-driven layout', () => {
  it('metrics grid renders with data-metrics-grid attribute', () => {
    const { container } = render(<ResultsStep />)
    const grids = container.querySelectorAll('[data-metrics-grid]')
    expect(grids.length).toBe(1)
  })

  it('metrics grid does NOT set inline grid-template-columns (CSS-driven only)', () => {
    const { container } = render(<ResultsStep />)
    const grid = container.querySelector('[data-metrics-grid]') as HTMLElement
    // Inline gridTemplateColumns must not be set — CSS governs layout
    expect(grid.style.gridTemplateColumns).toBe('')
  })

  it('renders all 4 metric labels regardless of viewport', () => {
    const { container } = render(<ResultsStep />)
    expect(container.textContent).toMatch(/success rate/i)
    expect(container.textContent).toMatch(/median ending balance/i)
    expect(container.textContent).toMatch(/P10 ending balance/i)
    expect(container.textContent).toMatch(/depletion age/i)
  })

  it('styles.css contains @media rule that collapses metrics grid to 2 cols on mobile', () => {
    const mediaIdx = css.indexOf('@media (max-width: 768px)')
    expect(mediaIdx).toBeGreaterThan(-1)
    const openIdx = css.indexOf('{', mediaIdx)
    let depth = 1
    let i = openIdx + 1
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    const block = css.slice(openIdx, i)
    expect(block).toMatch(/\[data-metrics-grid\][^{]*\{[^}]*grid-template-columns\s*:\s*1fr\s+1fr/)
  })

  it('styles.css base rule sets [data-metrics-grid] to 4-col desktop layout', () => {
    expect(css).toMatch(/\[data-metrics-grid\][^{]*\{[^}]*grid-template-columns\s*:\s*1\.4fr/s)
  })

  it('cashflow/sensitivity grid uses data-cashflow-grid and no inline template columns', () => {
    const { container } = render(<ResultsStep />)
    const grid = container.querySelector('[data-cashflow-grid]') as HTMLElement
    expect(grid).not.toBeNull()
    expect(grid.style.gridTemplateColumns).toBe('')
  })

  it('styles.css collapses [data-cashflow-grid] to a single column on mobile', () => {
    const mediaIdx = css.indexOf('@media (max-width: 768px)')
    const openIdx = css.indexOf('{', mediaIdx)
    let depth = 1
    let i = openIdx + 1
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    const block = css.slice(openIdx, i)
    expect(block).toMatch(/\[data-cashflow-grid\][^{]*\{[^}]*grid-template-columns\s*:\s*1fr/)
  })

  it('styles.css gives chart grid children min-width:0 so tracks can shrink below content width', () => {
    expect(css).toMatch(/\[data-cashflow-grid\]\s*>\s*\*\s*\{[^}]*min-width\s*:\s*0/)
  })
})
