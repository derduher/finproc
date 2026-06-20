/**
 * ResultExplorer — the interactive headline. Solved values (earliest age /
 * sustainable spend) and the confidence value arrive as props (MainScreen owns
 * the solver hooks); the explorer edits the store directly for the second
 * slider and the editable plan chips.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResultExplorer } from './ResultExplorer'
import { useStore, initialUiState } from '../../store'
import { defaultInputs } from '../../schema'

function setInputs() {
  useStore.setState({
    inputs: {
      ...defaultInputs(),
      person: { ...defaultInputs().person, currentAge: 44, annualSalary: 160_000, maxAge: 95, retirementAge: 60 },
      accounts: [
        { id: 'a', name: '401(k)', type: 'traditional', balance: 410_000, contributionAmount: 0, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 60, withdrawalStartAge: 60, accountSubtype: '401k', contributeMax: true },
      ],
      annualExpenses: 86_000,
      baselineExpenses: [{ id: 'g', label: 'General living', category: 'other', annualAmountPresentDollars: 86_000 }],
    },
    ui: initialUiState(),
  })
}

beforeEach(setInputs)

function baseProps() {
  return {
    confidence: 0.9,
    sustainableSpend: 88_000,
    earliestAge: 55 as number | null | undefined,
    solvingSpend: false,
    solvingAge: false,
    onConfidenceChange: vi.fn(),
    onAdvanced: vi.fn(),
  }
}

describe('ResultExplorer', () => {
  it('shows the earliest age in age mode and switches to sustainable spend', () => {
    render(<ResultExplorer {...baseProps()} />)
    expect(screen.getByText(/age 55/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Most I can spend/i }))
    expect(screen.getByText('$88K')).toBeInTheDocument()
  })

  it('confidence slider reports changes up', () => {
    const props = baseProps()
    render(<ResultExplorer {...props} />)
    fireEvent.change(screen.getByLabelText('Confidence'), { target: { value: '95' } })
    expect(props.onConfidenceChange).toHaveBeenCalledWith(0.95)
  })

  it('target-spend slider edits the store (age mode)', () => {
    render(<ResultExplorer {...baseProps()} />)
    fireEvent.change(screen.getByLabelText('Target spend'), { target: { value: '100000' } })
    expect(useStore.getState().inputs.annualExpenses).toBe(100_000)
  })

  it('retire-age slider edits the store (spend mode)', () => {
    render(<ResultExplorer {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /Most I can spend/i }))
    fireEvent.change(screen.getByLabelText('Retire at age'), { target: { value: '62' } })
    expect(useStore.getState().inputs.person.retirementAge).toBe(62)
  })

  it('editing the age plan chip patches the store', () => {
    render(<ResultExplorer {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit age/i }))
    const field = screen.getByLabelText('Edit age value')
    fireEvent.change(field, { target: { value: '46' } })
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }))
    expect(useStore.getState().inputs.person.currentAge).toBe(46)
  })

  it('structural chips open Advanced', () => {
    const props = baseProps()
    render(<ResultExplorer {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /edit saved/i }))
    expect(props.onAdvanced).toHaveBeenCalled()
  })
})
