import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { useStore, initialFirstRun } from '../../store'
import { buildFirstRunInputs } from './GuidedFirstRun'
import { GuessCheck, ConfirmedStrip } from './GuessCheck'

const PLAN = buildFirstRunInputs({ currentAge: 42, retireAge: 65, saved: 340_000, addingMonthly: 2_540, targetSpend: 80_000 })

beforeEach(() => {
  useStore.setState({
    inputs: PLAN,
    ui: {
      displayMode: 'nominal', aesthetic: 'warm', theme: 'light', density: 'comfortable',
      lastCommittedAt: null,
      firstRun: { ...initialFirstRun(), active: true },
    },
  })
})

const noSwings = { ss: 8000, match: 3000, mix: 4000 }

describe('GuessCheck', () => {
  it('renders the three guesses with swing tags', () => {
    render(<GuessCheck swings={noSwings} onOpenAdvanced={() => {}} />)
    expect(screen.getByText('Social Security')).toBeInTheDocument()
    expect(screen.getByText('Employer match')).toBeInTheDocument()
    expect(screen.getByText('Account mix')).toBeInTheDocument()
    expect(screen.getByText(/0 of 3 checked/)).toBeInTheDocument()
  })

  it('"About right" confirms a guess in the store', () => {
    render(<GuessCheck swings={noSwings} onOpenAdvanced={() => {}} />)
    const ssRow = screen.getByText('Social Security').closest('.guess-row') as HTMLElement
    fireEvent.click(within(ssRow).getByRole('button', { name: /about right/i }))
    expect(useStore.getState().ui.firstRun.checked.ss).toBe(true)
    expect(screen.getByText(/1 of 3 checked/)).toBeInTheDocument()
  })

  it('"Fix it" on Social Security opens an inline editor that patches the input and confirms', () => {
    render(<GuessCheck swings={noSwings} onOpenAdvanced={() => {}} />)
    const ssRow = screen.getByText('Social Security').closest('.guess-row') as HTMLElement
    fireEvent.click(within(ssRow).getByRole('button', { name: /fix it/i }))
    const benefit = screen.getByLabelText('Social Security benefit per year')
    fireEvent.change(benefit, { target: { value: '31200' } })
    fireEvent.click(screen.getByRole('button', { name: /use this number/i }))
    expect(useStore.getState().inputs.socialSecurity?.annualAmountPresentDollars).toBe(31_200)
    expect(useStore.getState().ui.firstRun.checked.ss).toBe(true)
  })

  it('"Fix it" on the account mix routes to Advanced and marks it checked', () => {
    const onOpenAdvanced = vi.fn()
    render(<GuessCheck swings={noSwings} onOpenAdvanced={onOpenAdvanced} />)
    const mixRow = screen.getByText('Account mix').closest('.guess-row') as HTMLElement
    fireEvent.click(within(mixRow).getByRole('button', { name: /fix it/i }))
    expect(onOpenAdvanced).toHaveBeenCalled()
    expect(useStore.getState().ui.firstRun.checked.mix).toBe(true)
  })

  it('shows the "See all in Advanced" escape hatch', () => {
    const onOpenAdvanced = vi.fn()
    render(<GuessCheck swings={noSwings} onOpenAdvanced={onOpenAdvanced} />)
    fireEvent.click(screen.getByRole('button', { name: /see all in advanced/i }))
    expect(onOpenAdvanced).toHaveBeenCalled()
  })
})

describe('ConfirmedStrip', () => {
  it('summarises the three now-owned inputs', () => {
    render(<ConfirmedStrip />)
    expect(screen.getByText(/three inputs that move this number are yours/i)).toBeInTheDocument()
    expect(screen.getByText(/account mix/i)).toBeInTheDocument()
  })
})
