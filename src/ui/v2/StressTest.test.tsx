import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StressTest } from './StressTest'
import type { HistoricalStress } from '../../hooks/useHistoricalStress'

const stress: HistoricalStress = {
  scenarios: [
    {
      scenario: { id: 'gfc2008', name: 'Global Financial Crisis', startYear: 2008, blurb: 'A −37% crash.' },
      anchorAge: 65,
      balances: [100, 70, 80],
      survived: true,
      depleteAge: undefined,
      troughBalance: 70,
      troughAge: 66,
      endBalance: 80,
    },
    {
      scenario: { id: 'gd1929', name: 'Great Depression', startYear: 1929, blurb: 'A −83% drawdown.' },
      anchorAge: 65,
      balances: [100, 40, 0],
      survived: false,
      depleteAge: 70,
      troughBalance: 0,
      troughAge: 67,
      endBalance: 0,
    },
  ],
  cohort: { total: 72, survived: 68, survivalRate: 68 / 72, failedYears: [1929, 1965, 1966], worstSurvivedYear: 1973 },
}

describe('StressTest', () => {
  it('shows the cohort headline with the failing years named as ranges', () => {
    render(<StressTest stress={stress} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByText(/68 of 72/)).toBeInTheDocument()
    expect(screen.getByText(/1965–1966/)).toBeInTheDocument()
  })

  it('renders a card per crisis with pass/fail status', () => {
    render(<StressTest stress={stress} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByText('Global Financial Crisis')).toBeInTheDocument()
    expect(screen.getByText('held')).toBeInTheDocument()
    expect(screen.getByText(/ran short · 70/)).toBeInTheDocument()
  })

  it('toggles selection when a card is clicked', () => {
    const onSelect = vi.fn()
    render(<StressTest stress={stress} selectedId={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Global Financial Crisis'))
    expect(onSelect).toHaveBeenCalledWith('gfc2008')
  })

  it('deselects when the already-selected card is clicked again', () => {
    const onSelect = vi.fn()
    render(<StressTest stress={stress} selectedId="gfc2008" onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Global Financial Crisis'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
