import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonStep } from './PersonStep'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'

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

describe('PersonStep — design copy', () => {
  it('renders the eyebrow "Step 1 of 6 · about you"', () => {
    render(<PersonStep />)
    expect(screen.getByText(/Step 1 of 6/i)).toBeInTheDocument()
    expect(screen.getByText(/about you/i)).toBeInTheDocument()
  })

  it('renders the h1 "Tell us where you\'re starting from"', () => {
    render(<PersonStep />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toMatch(/Tell us where you're starting from/i)
  })

  it('renders the supporting description about today\'s dollars', () => {
    render(<PersonStep />)
    expect(screen.getByText(/today's dollars/i)).toBeInTheDocument()
  })
})

describe('PersonStep — fields', () => {
  it('renders all seven fields (incl. retirement age)', () => {
    render(<PersonStep />)
    // Use IDs to target the inputs specifically and avoid matching tooltips
    expect(document.getElementById('current-age')).not.toBeNull()
    expect(document.getElementById('retirement-age')).not.toBeNull()
    expect(document.getElementById('planning-to-age')).not.toBeNull()
    expect(document.getElementById('annual-salary')).not.toBeNull()
    expect(document.getElementById('salary-growth')).not.toBeNull()
    expect(document.getElementById('marginal-tax')).not.toBeNull()
    expect(document.getElementById('ltcg-rate')).not.toBeNull()
  })

  it('current age input updates the store', () => {
    render(<PersonStep />)
    const input = screen.getByLabelText(/current age/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '45' } })
    expect(useStore.getState().inputs.person.currentAge).toBe(45)
  })

  it('retirement age input updates the store', () => {
    render(<PersonStep />)
    const input = screen.getByLabelText(/retirement age/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '60' } })
    expect(useStore.getState().inputs.person.retirementAge).toBe(60)
  })
})

describe('PersonStep — tax assumptions sub-section', () => {
  it('renders a "tax assumptions" label dividing the tax fields from the others', () => {
    render(<PersonStep />)
    expect(screen.getByText(/tax assumptions/i)).toBeInTheDocument()
  })
})

describe('PersonStep — simplifications card', () => {
  it('renders the documented-simplifications card', () => {
    render(<PersonStep />)
    expect(screen.getByText(/documented simplifications|simplifications/i)).toBeInTheDocument()
  })
})
