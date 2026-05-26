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

describe('PipeEditor — balance input', () => {
  it('renders a balance input with the current account balance', () => {
    const onChange = vi.fn()
    render(<PipeEditor account={makeAccount()} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const input = screen.getByLabelText(/current balance/i) as HTMLInputElement
    expect(input).toBeTruthy()
    expect(Number(input.value)).toBe(150_000)
  })

  it('typing in the balance input calls onChange with the new balance', () => {
    const onChange = vi.fn()
    render(<PipeEditor account={makeAccount()} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const input = screen.getByLabelText(/current balance/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '200000' } })
    expect(onChange).toHaveBeenCalledWith({ balance: 200_000 })
  })
})

describe('PipeEditor — costBasis input (taxable only)', () => {
  it('shows costBasis input when account type is taxable', () => {
    const onChange = vi.fn()
    const acc = makeAccount({ type: 'taxable', costBasis: 88_000 })
    render(<PipeEditor account={acc} annualSalary={120_000} onChange={onChange} onDelete={() => {}} />)
    const input = screen.getByLabelText(/cost basis/i) as HTMLInputElement
    expect(input).toBeTruthy()
    expect(Number(input.value)).toBe(88_000)
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
    fireEvent.change(input, { target: { value: '60000' } })
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
    expect(Number(input.value)).toBe(6000)
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
