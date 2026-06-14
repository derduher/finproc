import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RangeHero } from './RangeHero'

describe('RangeHero', () => {
  it('renders the low–high band and best-guess marker once solved', () => {
    render(<RangeHero low={94_000} high={112_000} best={103_000} uncheckedCount={3} />)
    expect(screen.getByText('$94.0K')).toBeInTheDocument()
    expect(screen.getByText('$112.0K')).toBeInTheDocument()
    expect(screen.getByText(/best guess \$103\.0K/)).toBeInTheDocument()
    expect(screen.getByText(/3 guesses unchecked/)).toBeInTheDocument()
  })

  it('singularises the pill when one guess remains', () => {
    render(<RangeHero low={98_000} high={108_000} best={103_000} uncheckedCount={1} />)
    expect(screen.getByText(/1 guess unchecked/)).toBeInTheDocument()
  })

  it('shows a placeholder while the band is still solving', () => {
    render(<RangeHero low={null} high={null} best={null} uncheckedCount={3} />)
    expect(screen.getByText('…')).toBeInTheDocument()
    expect(screen.queryByText(/best guess/)).not.toBeInTheDocument()
  })
})
