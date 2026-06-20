/**
 * IntakeWizard — the guided intake reaches a complete, validated plan.
 * Verifies navigation, that field edits flow into the draft, and that finishing
 * the last step commits inputs built from what was entered.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IntakeWizard } from './IntakeWizard'
import { SimulationInputsSchema } from '../../../schema'

function start() {
  const onComplete = vi.fn()
  render(<IntakeWizard onComplete={onComplete} />)
  fireEvent.click(screen.getByRole('button', { name: /Start —/ }))
  return onComplete
}

describe('IntakeWizard', () => {
  it('shows the intro first, then the age step on Start', () => {
    render(<IntakeWizard onComplete={() => {}} />)
    expect(screen.getByRole('heading', { name: /earliest.*you could retire/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start —/ }))
    expect(screen.getByRole('heading', { name: /start with your age/i })).toBeInTheDocument()
  })

  it('edits flow into the draft and a complete plan is built on finish', () => {
    const onComplete = start()

    // Step 1 — age & salary
    const age = screen.getByLabelText('Current age') as HTMLInputElement
    fireEvent.change(age, { target: { value: '44' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))

    // Step 2 — accounts (seeded with two starter accounts); jump ahead via the rail
    expect(screen.getByRole('heading', { name: /what have you saved/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))

    // Step 3 — expenses
    expect(screen.getByRole('heading', { name: /spend in a typical year/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))

    // Step 4 — one-time
    expect(screen.getByRole('heading', { name: /one-time expenses/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))

    // Step 5 — social security → finish
    expect(screen.getByRole('heading', { name: /social security pay you/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /See my projection/ }))

    expect(onComplete).toHaveBeenCalledTimes(1)
    const inputs = onComplete.mock.calls[0][0]
    expect(() => SimulationInputsSchema.parse(inputs)).not.toThrow()
    expect(inputs.person.currentAge).toBe(44)
    expect(inputs.accounts.length).toBeGreaterThan(0)
  })

  it('does not let you remove the last account (avoids re-trapping on the wizard)', () => {
    start()
    fireEvent.click(screen.getByRole('button', { name: /Continue/ })) // age → accounts
    const removeButtons = screen.getAllByRole('button', { name: /^Remove / })
    expect(removeButtons.length).toBe(2)
    fireEvent.click(removeButtons[0])
    expect(screen.queryAllByRole('button', { name: /^Remove / }).length).toBe(0)
  })

  it('the rail lets you jump between steps', () => {
    start()
    fireEvent.click(screen.getByRole('button', { name: /One-time costs/ }))
    expect(screen.getByRole('heading', { name: /one-time expenses/i })).toBeInTheDocument()
  })
})
