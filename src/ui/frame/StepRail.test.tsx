import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepRail } from './StepRail'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'

beforeEach(() => {
  useStore.setState({
    inputs: { ...defaultInputs(), seed: 0x4f2a },
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

describe('StepRail — design sub-labels', () => {
  it('renders all six steps with design copy', () => {
    render(<StepRail />)
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByText('Markets')).toBeInTheDocument()
    expect(screen.getByText('Expenses')).toBeInTheDocument()
    expect(screen.getByText('Strategy')).toBeInTheDocument()
    expect(screen.getByText('Results')).toBeInTheDocument()
    expect(screen.getByText('age, salary, taxes')).toBeInTheDocument()
    expect(screen.getByText('balances, contribs')).toBeInTheDocument()
    expect(screen.getByText('growth & inflation')).toBeInTheDocument()
    expect(screen.getByText('annual + one-time')).toBeInTheDocument()
    expect(screen.getByText('withdrawal order')).toBeInTheDocument()
    expect(screen.getByText('projection')).toBeInTheDocument()
  })
})

describe('StepRail — navigation', () => {
  it('clicking a step button calls setActiveStep', () => {
    render(<StepRail />)
    fireEvent.click(screen.getByRole('button', { name: /Step 3/i }))
    expect(useStore.getState().ui.activeStep).toBe(2)
  })
})

describe('StepRail — seed display', () => {
  it('renders the seed as a 0x{hex} string in the footer', () => {
    render(<StepRail />)
    expect(screen.getByText(/0x4f2a/i)).toBeInTheDocument()
  })

  it('renders "1,000 runs · monte carlo" in the footer', () => {
    render(<StepRail />)
    expect(screen.getByText(/1,000/)).toBeInTheDocument()
    expect(screen.getByText(/monte carlo/i)).toBeInTheDocument()
  })
})
