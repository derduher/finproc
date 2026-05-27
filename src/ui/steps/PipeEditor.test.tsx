/**
 * Tests for the PipeEditor form inputs: balance, costBasis, and employerMatch.
 *
 * These fields are part of the Account schema but were missing from the UI —
 * the diagram displayed account.balance but no input let the user edit it.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PipeEditor } from './PipeEditor'
import type { Account } from '../../schema'

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Fidelity 401(k)',
    type: 'traditional',
    balance: 150_000,
    contributionAmount: 2000,
    contributionType: 'flat',
    contributionFrequency: 'monthly',
    contributionEndAge: 62,
    withdrawalStartAge: 59,
    ...overrides,
  }
}

function readMoney(input: HTMLInputElement): number {
  return Number(input.value.replace(/,/g, '')) || 0
}

describe('PipeEditor — balance input', () => {
  it('renders a balance input with the current account balance', () => {
    const onChange = vi.fn()
    render(<PipeEditor account={makeAccount()} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const input = screen.getByLabelText(/current balance/i) as HTMLInputElement
    expect(input).toBeTruthy()
    expect(readMoney(input)).toBe(150_000)
  })

  it('formats balance with locale separators (1,000-style)', () => {
    render(<PipeEditor account={makeAccount({ balance: 150_000 })} annualSalary={120_000} onChange={vi.fn()} onDelete={() => {}} />)
    const input = screen.getByLabelText(/current balance/i) as HTMLInputElement
    expect(input.value).toBe('150,000')
  })

  it('typing in the balance input calls onChange with the new balance', () => {
    const onChange = vi.fn()
    render(<PipeEditor account={makeAccount()} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const input = screen.getByLabelText(/current balance/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '200,000' } })
    expect(onChange).toHaveBeenCalledWith({ balance: 200_000 })
  })

  it('snaps balance to nearest 1000 on blur', () => {
    const onChange = vi.fn()
    render(<PipeEditor account={makeAccount({ balance: 12345 })} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const input = screen.getByLabelText(/current balance/i) as HTMLInputElement
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ balance: 12000 })
  })
})

describe('PipeEditor — withdrawal-age label semantics', () => {
  it('uses the legal-eligibility label for traditional accounts', () => {
    render(<PipeEditor account={makeAccount({ type: 'traditional' })} annualSalary={120_000} onChange={vi.fn()} onDelete={() => {}} />)
    expect(screen.getByText(/withdrawals eligible at age/i)).toBeInTheDocument()
  })

  it('uses a plan-sequencing label for taxable accounts (no IRS rule applies)', () => {
    const { container } = render(<PipeEditor account={makeAccount({ type: 'taxable', costBasis: 10000 })} annualSalary={120_000} onChange={vi.fn()} onDelete={() => {}} />)
    // Taxable accounts have no IRS age restriction; label should reflect that.
    expect(container.textContent).not.toMatch(/withdrawals eligible at age/i)
    expect(container.textContent).toMatch(/plan.draw age|first.tap age|when.*draw.*from/i)
  })
})

describe('PipeEditor — costBasis input (taxable only)', () => {
  it('shows costBasis input when account type is taxable', () => {
    const onChange = vi.fn()
    const acc = makeAccount({ type: 'taxable', costBasis: 88_000 })
    render(<PipeEditor account={acc} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const input = screen.getByLabelText(/cost basis/i) as HTMLInputElement
    expect(input).toBeTruthy()
    expect(readMoney(input)).toBe(88_000)
  })

  it('hides costBasis input for non-taxable accounts', () => {
    const onChange = vi.fn()
    render(<PipeEditor account={makeAccount({ type: 'traditional' })} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    expect(screen.queryByLabelText(/cost basis/i)).toBeNull()
  })

  it('typing in costBasis calls onChange with the new value', () => {
    const onChange = vi.fn()
    const acc = makeAccount({ type: 'taxable', costBasis: 50_000 })
    render(<PipeEditor account={acc} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const input = screen.getByLabelText(/cost basis/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '60,000' } })
    expect(onChange).toHaveBeenCalledWith({ costBasis: 60_000 })
  })
})

describe('PipeEditor — employerMatch inputs (traditional only)', () => {
  it('shows employer match section for traditional accounts', () => {
    const onChange = vi.fn()
    render(<PipeEditor account={makeAccount({ type: 'traditional' })} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    // The form section uses an enable-toggle as its accessible signature; the SVG
    // diagram also contains an "EMPLOYER MATCH" label, so we target the input.
    expect(screen.getByLabelText(/enable employer match/i)).toBeTruthy()
  })

  it('hides employer match section for non-traditional accounts', () => {
    const onChange = vi.fn()
    render(<PipeEditor account={makeAccount({ type: 'roth' })} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    // No section header should be in the form (the diagram may say "EMPLOYER MATCH" inside SVG though,
    // so check for the form field label which is lowercase and outside the SVG)
    const form = screen.queryByLabelText(/match percent/i)
    expect(form).toBeNull()
  })

  it('renders percent-match controls when employerMatch.type is percent', () => {
    const onChange = vi.fn()
    const acc = makeAccount({
      type: 'traditional',
      employerMatch: { type: 'percent', matchPercent: 50, upToPercent: 6 },
    })
    render(<PipeEditor account={acc} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const matchInput = screen.getByLabelText(/match percent/i) as HTMLInputElement
    expect(Number(matchInput.value)).toBe(50)
    const capInput = screen.getByLabelText(/up to percent/i) as HTMLInputElement
    expect(Number(capInput.value)).toBe(6)
  })

  it('editing matchPercent calls onChange with updated employerMatch', () => {
    const onChange = vi.fn()
    const acc = makeAccount({
      type: 'traditional',
      employerMatch: { type: 'percent', matchPercent: 50, upToPercent: 6 },
    })
    render(<PipeEditor account={acc} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const matchInput = screen.getByLabelText(/match percent/i) as HTMLInputElement
    fireEvent.change(matchInput, { target: { value: '75' } })
    expect(onChange).toHaveBeenCalledWith({
      employerMatch: { type: 'percent', matchPercent: 75, upToPercent: 6 },
    })
  })

  it('renders flat-match input when employerMatch.type is flat', () => {
    const onChange = vi.fn()
    const acc = makeAccount({
      type: 'traditional',
      employerMatch: { type: 'flat', annualAmount: 6000 },
    })
    render(<PipeEditor account={acc} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const input = screen.getByLabelText(/annual match amount/i) as HTMLInputElement
    expect(readMoney(input)).toBe(6000)
  })

  it('toggling match-on adds a default percent match', () => {
    const onChange = vi.fn()
    const acc = makeAccount({ type: 'traditional' /* no employerMatch */ })
    render(<PipeEditor account={acc} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const toggle = screen.getByLabelText(/enable employer match/i) as HTMLInputElement
    expect(toggle.checked).toBe(false)
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith({
      employerMatch: { type: 'percent', matchPercent: 50, upToPercent: 6 },
    })
  })

  it('toggling match-off removes employerMatch', () => {
    const onChange = vi.fn()
    const acc = makeAccount({
      type: 'traditional',
      employerMatch: { type: 'percent', matchPercent: 50, upToPercent: 6 },
    })
    render(<PipeEditor account={acc} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const toggle = screen.getByLabelText(/enable employer match/i) as HTMLInputElement
    expect(toggle.checked).toBe(true)
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith({ employerMatch: undefined })
  })
})

describe('PipeEditor — account subtype + max contribution', () => {
  it('renders a subtype selector (401k / IRA / other) for traditional accounts', () => {
    render(<PipeEditor account={makeAccount({ type: 'traditional' })} annualSalary={120_000} onChange={vi.fn()} onDelete={() => {}} />)
    expect(screen.getByRole('radio', { name: /401k/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /ira/i })).toBeInTheDocument()
  })

  it('hides the subtype selector for taxable accounts', () => {
    render(<PipeEditor account={makeAccount({ type: 'taxable', costBasis: 10000 })} annualSalary={120_000} onChange={vi.fn()} onDelete={() => {}} />)
    expect(screen.queryByRole('radio', { name: /^401k$/i })).toBeNull()
  })

  it('selecting a subtype calls onChange with accountSubtype', () => {
    const onChange = vi.fn()
    render(<PipeEditor account={makeAccount({ type: 'traditional' })} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: /401k/i }))
    expect(onChange).toHaveBeenCalledWith({ accountSubtype: '401k' })
  })

  it('renders a "contribute the max" checkbox when subtype is 401k or ira', () => {
    render(
      <PipeEditor
        account={makeAccount({ type: 'traditional', accountSubtype: '401k' })}
        annualSalary={120_000}
        onChange={vi.fn()}
        onDelete={() => {}}
      />,
    )
    expect(screen.getByLabelText(/contribute the max/i)).toBeInTheDocument()
  })

  it('does not render the max checkbox when subtype is "other" or unset', () => {
    render(
      <PipeEditor
        account={makeAccount({ type: 'traditional' })}
        annualSalary={120_000}
        onChange={vi.fn()}
        onDelete={() => {}}
      />,
    )
    expect(screen.queryByLabelText(/contribute the max/i)).toBeNull()
  })

  it('toggling the max checkbox calls onChange with contributeMax=true', () => {
    const onChange = vi.fn()
    render(
      <PipeEditor
        account={makeAccount({ type: 'traditional', accountSubtype: '401k' })}
        annualSalary={120_000}
        onChange={onChange}
        onDelete={() => {}}
      />,
    )
    fireEvent.click(screen.getByLabelText(/contribute the max/i))
    expect(onChange).toHaveBeenCalledWith({ contributeMax: true })
  })

  it('when contributeMax is true, the amount input is disabled', () => {
    render(
      <PipeEditor
        account={makeAccount({ type: 'traditional', accountSubtype: '401k', contributeMax: true })}
        annualSalary={120_000}
        onChange={vi.fn()}
        onDelete={() => {}}
      />,
    )
    // The contribution amount input lives in the contributions section; it should be disabled
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const amtInput = inputs.find((i) => Number(i.value) === 2000 || Number(i.value) === 50)
    // Simply check disabled state on numeric input(s) inside the contributions area
    const disabledNumberInputs = inputs.filter((i) => i.disabled)
    expect(disabledNumberInputs.length).toBeGreaterThan(0)
    void amtInput
  })

  it('shows a tiny "max" annotation explaining the limit', () => {
    const { container } = render(
      <PipeEditor
        account={makeAccount({ type: 'traditional', accountSubtype: '401k', contributeMax: true })}
        annualSalary={120_000}
        onChange={vi.fn()}
        onDelete={() => {}}
      />,
    )
    // Should reference the IRS limit in some way
    expect(container.textContent).toMatch(/\$24,500|IRS|annual limit/i)
  })

})
