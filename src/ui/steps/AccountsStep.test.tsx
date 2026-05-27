import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AccountsStep } from './AccountsStep'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'
import type { Account } from '../../schema'

const SAMPLE_ACCOUNTS: Account[] = [
  { id: 't', name: 'Fidelity 401(k)', type: 'traditional', balance: 180_000, contributionAmount: 0.15, contributionType: 'percent', contributionFrequency: 'monthly', contributionEndAge: 62, withdrawalStartAge: 59 },
  { id: 'r', name: 'Roth IRA', type: 'roth', balance: 42_000, contributionAmount: 540, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 62, withdrawalStartAge: 59 },
  { id: 'x', name: 'Brokerage', type: 'taxable', balance: 88_000, costBasis: 54_000, contributionAmount: 300, contributionType: 'flat', contributionFrequency: 'monthly', contributionEndAge: 62, withdrawalStartAge: 50 },
]

beforeEach(() => {
  useStore.setState({
    inputs: { ...defaultInputs(), accounts: SAMPLE_ACCOUNTS },
    ui: {
      activeStep: 1,
      displayMode: 'nominal',
      aesthetic: 'warm',
      theme: 'light',
      density: 'comfortable',
      lastCommittedAt: null,
    },
  })
})

describe('AccountsStep — design copy', () => {
  it('renders eyebrow "Step 2 of 6 · accounts"', () => {
    render(<AccountsStep />)
    expect(screen.getByText(/Step 2 of 6.*accounts/i)).toBeInTheDocument()
  })

  it('renders h1 "What are you saving, where?"', () => {
    render(<AccountsStep />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toMatch(/saving/i)
  })
})

describe('AccountsStep — account cards', () => {
  it('renders one card per account', () => {
    render(<AccountsStep />)
    // Active card's name also appears in the PipeEditor header — use getAllByText
    expect(screen.getAllByText('Fidelity 401(k)').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Roth IRA').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Brokerage').length).toBeGreaterThan(0)
  })

  it('renders an "+ add account" affordance', () => {
    render(<AccountsStep />)
    expect(screen.getByText(/add account/i)).toBeInTheDocument()
  })

  it('+ add account creates an account with contributionEndAge defaulted to retirementAge', () => {
    useStore.setState((s) => ({
      inputs: { ...s.inputs, person: { ...s.inputs.person, retirementAge: 67 }, accounts: [] },
    }))
    render(<AccountsStep />)
    const addBtn = screen.getByText(/add account/i).closest('button') as HTMLButtonElement
    fireEvent.click(addBtn)
    const accounts = useStore.getState().inputs.accounts
    expect(accounts.length).toBe(1)
    expect(accounts[0].contributionEndAge).toBe(67)
    expect(accounts[0].withdrawalStartAge).toBe(67)
  })

  it('clicking an account card sets it active', () => {
    const { container } = render(<AccountsStep />)
    const roth = screen.getByText('Roth IRA').closest('[role="button"]') as HTMLElement
    fireEvent.click(roth)
    // active card carries an EDITING indicator
    expect(container.textContent).toMatch(/editing/i)
  })
})

describe('AccountsStep — pipe editor', () => {
  it('renders a PipeEditor card for the active account', () => {
    render(<AccountsStep />)
    // Active by default = first account
    expect(screen.getByLabelText(/pipe diagram/i)).toBeInTheDocument()
  })

  it('pipe diagram is an SVG element', () => {
    render(<AccountsStep />)
    const pipe = screen.getByLabelText(/pipe diagram/i)
    expect(pipe.querySelector('svg')).not.toBeNull()
  })

  it('renders editable name / type / contributions / withdrawal fields', () => {
    render(<AccountsStep />)
    // Name field reflects the active account
    const nameInput = document.querySelector('input[data-field="account-name"]') as HTMLInputElement
    expect(nameInput?.value).toBe('Fidelity 401(k)')
  })
})
