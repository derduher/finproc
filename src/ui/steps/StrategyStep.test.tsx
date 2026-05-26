import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StrategyStep } from './StrategyStep'
import { useStore } from '../../store'
import { defaultInputs, WithdrawalStrategy } from '../../schema'

beforeEach(() => {
  useStore.setState({
    inputs: {
      ...defaultInputs(),
      withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
    },
    ui: {
      activeStep: 4,
      displayMode: 'nominal',
      aesthetic: 'warm',
      theme: 'light',
      density: 'comfortable',
      lastCommittedAt: null,
    },
  })
})

describe('StrategyStep — design copy', () => {
  it('renders eyebrow "Step 5 of 6 · strategy"', () => {
    render(<StrategyStep />)
    expect(screen.getByText(/Step 5 of 6.*strategy/i)).toBeInTheDocument()
  })

  it('renders h1 "Which account to drain first?"', () => {
    render(<StrategyStep />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toMatch(/drain first/i)
  })
})

describe('StrategyStep — strategy pills', () => {
  it('renders three strategy pill cards', () => {
    render(<StrategyStep />)
    expect(screen.getByText(/tax-optimal/i)).toBeInTheDocument()
    expect(screen.getByText(/proportional/i)).toBeInTheDocument()
    expect(screen.getByText(/user-defined|custom/i)).toBeInTheDocument()
  })

  it('clicking a strategy pill updates the store', () => {
    render(<StrategyStep />)
    const proportional = screen.getByText(/proportional/i).closest('[role="button"]') as HTMLElement
    fireEvent.click(proportional)
    expect(useStore.getState().inputs.withdrawalStrategy).toBe(WithdrawalStrategy.Proportional)
  })

  it('active pill has the editing/active badge', () => {
    const { container } = render(<StrategyStep />)
    expect(container.textContent).toMatch(/active/i)
  })
})

describe('StrategyStep — money flow diagram', () => {
  it('renders the money flow diagram SVG', () => {
    render(<StrategyStep />)
    expect(screen.getByLabelText(/money flow|withdrawal flow/i)).toBeInTheDocument()
  })

  it('TaxOptimal: all three flow arrows have data-active reflecting drain order (taxable=1, traditional=2, roth=3)', () => {
    useStore.setState((s) => ({
      inputs: { ...s.inputs, withdrawalStrategy: WithdrawalStrategy.TaxOptimal },
    }))
    const { container } = render(<StrategyStep />)
    const taxable = container.querySelector('[data-flow="taxable"]')
    const trad = container.querySelector('[data-flow="traditional"]')
    const roth = container.querySelector('[data-flow="roth"]')
    expect(taxable).not.toBeNull()
    expect(trad).not.toBeNull()
    expect(roth).not.toBeNull()
    expect(taxable!.getAttribute('data-active')).toBe('1')
    expect(trad!.getAttribute('data-active')).toBe('2')
    expect(roth!.getAttribute('data-active')).toBe('3')
  })

  it('Proportional: all three flow arrows are equally active (data-active="proportional")', () => {
    useStore.setState((s) => ({
      inputs: { ...s.inputs, withdrawalStrategy: WithdrawalStrategy.Proportional },
    }))
    const { container } = render(<StrategyStep />)
    expect(container.querySelector('[data-flow="taxable"]')!.getAttribute('data-active')).toBe('proportional')
    expect(container.querySelector('[data-flow="traditional"]')!.getAttribute('data-active')).toBe('proportional')
    expect(container.querySelector('[data-flow="roth"]')!.getAttribute('data-active')).toBe('proportional')
  })

  it('switching strategy updates which flow arrow is primary', () => {
    useStore.setState((s) => ({
      inputs: { ...s.inputs, withdrawalStrategy: WithdrawalStrategy.TaxOptimal },
    }))
    const { container, rerender } = render(<StrategyStep />)
    expect(container.querySelector('[data-flow="traditional"]')!.getAttribute('data-active')).toBe('2')
    useStore.setState((s) => ({
      inputs: { ...s.inputs, withdrawalStrategy: WithdrawalStrategy.Proportional },
    }))
    rerender(<StrategyStep />)
    expect(container.querySelector('[data-flow="traditional"]')!.getAttribute('data-active')).toBe('proportional')
  })
})
