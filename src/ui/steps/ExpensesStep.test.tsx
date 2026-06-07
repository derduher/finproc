import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExpensesStep } from './ExpensesStep'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'

beforeEach(() => {
  useStore.setState({
    inputs: {
      ...defaultInputs(),
      annualExpenses: 70_000,
      socialSecurity: { annualAmountPresentDollars: 28_000, claimAge: 67 },
      oneTimeExpenses: [
        { id: 'h', label: 'House down payment', age: 36, amountPresentDollars: 80_000, recurringFollowOnAmount: 24_000 },
        { id: 'c', label: 'New car', age: 45, amountPresentDollars: 35_000 },
        { id: 'k', label: 'Kid college × 4 yrs', age: 50, amountPresentDollars: 120_000 },
      ],
    },
    ui: {
      activeStep: 3,
      displayMode: 'nominal',
      aesthetic: 'warm',
      theme: 'light',
      density: 'comfortable',
      lastCommittedAt: null,
    },
  })
})

describe('ExpensesStep — design copy', () => {
  it('renders eyebrow "Step 4 of 6 · expenses"', () => {
    render(<ExpensesStep />)
    expect(screen.getByText(/Step 4 of 6.*expenses/i)).toBeInTheDocument()
  })

  it('renders h1 "What does life cost?"', () => {
    render(<ExpensesStep />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toMatch(/life cost/i)
  })
})

describe('ExpensesStep — baseline card', () => {
  it('renders baseline annual expense amount', () => {
    render(<ExpensesStep />)
    expect(screen.getByText(/\$70,000/)).toBeInTheDocument()
  })

  it('renders Social Security info when claimed', () => {
    render(<ExpensesStep />)
    expect(screen.getByText(/social security/i)).toBeInTheDocument()
    expect(screen.getByText(/\$28,000/)).toBeInTheDocument()
  })
})

describe('ExpensesStep — itemized baseline', () => {
  beforeEach(() => {
    useStore.setState({
      inputs: {
        ...useStore.getState().inputs,
        baselineExpenses: [
          { id: 'h', label: 'Housing', category: 'housing', annualAmountPresentDollars: 40_000 },
          { id: 'f', label: 'Food', category: 'food', annualAmountPresentDollars: 30_000 },
        ],
        annualExpenses: 70_000,
      },
    })
  })

  it('renders a row per baseline expense item', () => {
    const { container } = render(<ExpensesStep />)
    expect(container.querySelectorAll('[data-expense-item]')).toHaveLength(2)
    expect(screen.getByDisplayValue('Housing')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Food')).toBeInTheDocument()
  })

  it('adding an item appends a row and keeps the total synced', () => {
    const { container } = render(<ExpensesStep />)
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }))
    expect(container.querySelectorAll('[data-expense-item]')).toHaveLength(3)
    expect(useStore.getState().inputs.annualExpenses).toBe(70_000) // new item is $0
  })

  it('editing an item amount re-derives the aggregate total', () => {
    render(<ExpensesStep />)
    const amounts = screen.getAllByLabelText('Expense amount')
    fireEvent.change(amounts[0], { target: { value: '50000' } })
    expect(useStore.getState().inputs.annualExpenses).toBe(80_000)
  })

  it('removing an item re-sums the remaining total', () => {
    render(<ExpensesStep />)
    fireEvent.click(screen.getAllByLabelText('Remove expense')[1])
    expect(useStore.getState().inputs.baselineExpenses).toHaveLength(1)
    expect(useStore.getState().inputs.annualExpenses).toBe(40_000)
  })
})

describe('ExpensesStep — life timeline', () => {
  it('renders the life timeline SVG', () => {
    render(<ExpensesStep />)
    expect(screen.getByLabelText(/life timeline/i)).toBeInTheDocument()
  })

  it('life timeline is an SVG', () => {
    render(<ExpensesStep />)
    const lt = screen.getByLabelText(/life timeline/i)
    expect(lt.querySelector('svg')).not.toBeNull()
  })

  it('renders a clickable year-cell rect for each year in the timeline (used by click-to-add)', () => {
    render(<ExpensesStep />)
    const lt = screen.getByLabelText(/life timeline/i)
    const cells = lt.querySelectorAll('[data-add-event-at-age]')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('clicking a year cell adds a new event at that age', () => {
    const { container } = render(<ExpensesStep />)
    const lt = screen.getByLabelText(/life timeline/i)
    const cell = lt.querySelector('[data-add-event-at-age="50"]') as SVGRectElement | null
    expect(cell).not.toBeNull()
    const beforeCount = container.querySelectorAll('[data-event-card]').length
    fireEvent.click(cell!)
    const afterCount = container.querySelectorAll('[data-event-card]').length
    expect(afterCount).toBe(beforeCount + 1)
  })
})

describe('ExpensesStep — event cards', () => {
  it('renders an event card per one-time expense', () => {
    render(<ExpensesStep />)
    expect(screen.getByText('House down payment')).toBeInTheDocument()
    expect(screen.getByText('New car')).toBeInTheDocument()
    expect(screen.getByText('Kid college × 4 yrs')).toBeInTheDocument()
  })

  it('renders an "+ add event" affordance', () => {
    render(<ExpensesStep />)
    // Pin to the "+ add event" button text (not the timeline cell tooltips, which
    // say "Click to add event at age N").
    expect(screen.getByText(/^\+?\s*add event$/i)).toBeInTheDocument()
  })
})
