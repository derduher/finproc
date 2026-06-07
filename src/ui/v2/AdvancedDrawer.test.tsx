import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AdvancedDrawer } from './AdvancedDrawer'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'

beforeEach(() => {
  useStore.setState({
    inputs: {
      ...defaultInputs(),
      person: { ...defaultInputs().person, retirementAge: 60 },
      baselineExpenses: [
        { id: 'h', label: 'Housing', category: 'housing', annualAmountPresentDollars: 40_000 },
        { id: 'f', label: 'Food', category: 'food', annualAmountPresentDollars: 30_000 },
      ],
      annualExpenses: 70_000,
    },
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

function section() {
  // Scope queries to the baseline-expenses accordion to avoid clashing with the
  // one-time expenditures section.
  return screen.getByTestId('baseline-expenses-section')
}

describe('AdvancedDrawer — baseline expenses', () => {
  it('lists a row per itemized baseline expense', () => {
    render(<AdvancedDrawer onClose={() => {}} />)
    expect(section().querySelectorAll('[data-baseline-item]')).toHaveLength(2)
    expect(screen.getByDisplayValue('Housing')).toBeInTheDocument()
  })

  it('editing an amount re-derives the aggregate total', () => {
    render(<AdvancedDrawer onClose={() => {}} />)
    const amounts = within(section()).getAllByLabelText('Baseline expense amount')
    fireEvent.change(amounts[1], { target: { value: '35000' } })
    expect(useStore.getState().inputs.annualExpenses).toBe(75_000)
  })

  it('removing an item re-sums the total', () => {
    render(<AdvancedDrawer onClose={() => {}} />)
    fireEvent.click(within(section()).getAllByLabelText('Remove baseline expense')[0])
    expect(useStore.getState().inputs.baselineExpenses).toHaveLength(1)
    expect(useStore.getState().inputs.annualExpenses).toBe(30_000)
  })

  it('one-click adds a suggested expense as a line item', () => {
    render(<AdvancedDrawer onClose={() => {}} />)
    const chip = within(section()).getByRole('button', { name: /property tax/i })
    fireEvent.click(chip)
    const items = useStore.getState().inputs.baselineExpenses
    expect(items.some((i) => i.label === 'Property tax')).toBe(true)
    expect(useStore.getState().inputs.annualExpenses).toBe(76_000)
  })

  it('a suggestion disappears once added', () => {
    render(<AdvancedDrawer onClose={() => {}} />)
    fireEvent.click(within(section()).getByRole('button', { name: /property tax/i }))
    expect(within(section()).queryByRole('button', { name: /property tax/i })).not.toBeInTheDocument()
  })
})
