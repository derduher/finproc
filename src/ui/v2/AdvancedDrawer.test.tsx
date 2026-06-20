import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AdvancedDrawer } from './AdvancedDrawer'
import { useStore, initialUiState } from '../../store'
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
    ui: initialUiState(),
  })
})

function section() {
  // Scope queries to the baseline-expenses accordion to avoid clashing with the
  // one-time expenditures section.
  return screen.getByTestId('baseline-expenses-section')
}

function seedAccount() {
  useStore.setState((s) => ({
    inputs: {
      ...s.inputs,
      accounts: [{
        id: 'k1',
        name: '401(k)',
        type: 'traditional' as const,
        balance: 200_000,
        contributionAmount: 500,
        contributionType: 'flat' as const,
        contributionFrequency: 'monthly' as const,
        contributionEndAge: 60,
        withdrawalStartAge: 60,
      }],
    },
  }))
}

describe('AdvancedDrawer — stock allocation per account', () => {
  it('renders an allocation input defaulting to 100% stocks', () => {
    seedAccount()
    render(<AdvancedDrawer onClose={() => {}} />)
    const input = screen.getByLabelText('Stock allocation') as HTMLInputElement
    expect(input.value).toBe('100')
  })

  it('shows the stored allocation and writes a 0–1 fraction on change', () => {
    seedAccount()
    useStore.setState((s) => ({
      inputs: { ...s.inputs, accounts: s.inputs.accounts.map((a) => ({ ...a, stockAllocation: 0.6 })) },
    }))
    render(<AdvancedDrawer onClose={() => {}} />)
    const input = screen.getByLabelText('Stock allocation') as HTMLInputElement
    expect(input.value).toBe('60')
    fireEvent.change(input, { target: { value: '40' } })
    expect(useStore.getState().inputs.accounts[0].stockAllocation).toBeCloseTo(0.4, 6)
  })

  it('clearing the field does not snap the allocation to 0% stocks', () => {
    seedAccount()
    useStore.setState((s) => ({
      inputs: { ...s.inputs, accounts: s.inputs.accounts.map((a) => ({ ...a, stockAllocation: 0.6 })) },
    }))
    render(<AdvancedDrawer onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Stock allocation'), { target: { value: '' } })
    expect(useStore.getState().inputs.accounts[0].stockAllocation).toBeCloseTo(0.6, 6)
  })
})

function openMarketReturns() {
  // The Market returns accordion is collapsed by default and renders no
  // children until expanded.
  fireEvent.click(screen.getByText('Market returns'))
}

describe('AdvancedDrawer — bond return band', () => {
  it('renders bond band inputs with the default band when unset', () => {
    render(<AdvancedDrawer onClose={() => {}} />)
    openMarketReturns()
    const lo = screen.getByLabelText(/bond growth.*min/i) as HTMLInputElement
    const hi = screen.getByLabelText(/bond growth.*max/i) as HTMLInputElement
    expect(Number(lo.value)).toBeCloseTo(2, 5)
    expect(Number(hi.value)).toBeCloseTo(6, 5)
  })

  it('editing the bond band writes bondGrowthMin/Max to the store', () => {
    render(<AdvancedDrawer onClose={() => {}} />)
    openMarketReturns()
    fireEvent.change(screen.getByLabelText(/bond growth.*min/i), { target: { value: '1' } })
    expect(useStore.getState().inputs.bondGrowthMin).toBeCloseTo(0.01, 6)
    fireEvent.change(screen.getByLabelText(/bond growth.*max/i), { target: { value: '7' } })
    expect(useStore.getState().inputs.bondGrowthMax).toBeCloseTo(0.07, 6)
  })

  it('the rate-sampling note reflects the long-run-band semantics', () => {
    render(<AdvancedDrawer onClose={() => {}} />)
    openMarketReturns()
    expect(screen.getByText(/long-run average/i)).toBeInTheDocument()
  })
})

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

  it('renders an essential toggle per item, defaulting from the category', () => {
    render(<AdvancedDrawer onClose={() => {}} />)
    const toggles = within(section()).getAllByLabelText('Essential expense') as HTMLInputElement[]
    // Housing and food are needs-type categories → essential by default.
    expect(toggles).toHaveLength(2)
    expect(toggles[0].checked).toBe(true)
    expect(toggles[1].checked).toBe(true)
  })

  it('unticking essential writes an explicit per-item override to the store', () => {
    render(<AdvancedDrawer onClose={() => {}} />)
    const toggles = within(section()).getAllByLabelText('Essential expense')
    fireEvent.click(toggles[1])
    const items = useStore.getState().inputs.baselineExpenses
    expect(items[1].essential).toBe(false)
    // The other item is untouched (still relying on its category default).
    expect(items[0].essential).toBeUndefined()
  })
})
