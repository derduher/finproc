import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WhatMoves } from './WhatMoves'
import type { SensitivityResult } from '../../schema'
import type { Insight } from '../../sim/insights'

const ROWS: SensitivityResult[] = [
  { label: 'Annual expenses', sub: '±20%', loDelta: 0.12, hiDelta: -0.18 },
  { label: 'Stock returns', sub: '±20%', loDelta: -0.1, hiDelta: 0.08 },
]

const CARDS: Insight[] = [
  { tone: 'good', title: 'Tax-optimal strategy is paying off', body: 'Lifts success by 3pp.', cta: 'See strategy' },
  { tone: 'warn', title: 'Healthcare gap (62 → 65)', body: "ACA premiums aren't modeled.", cta: 'Add expense' },
]

describe('WhatMoves — sensitivity tornado + insights', () => {
  it('renders the section heading and a tornado row per sensitivity entry', () => {
    render(<WhatMoves sensitivity={ROWS} insights={CARDS} loading={false} />)
    expect(screen.getByText(/what moves my plan/i)).toBeInTheDocument()
    expect(screen.getByText('Annual expenses')).toBeInTheDocument()
    expect(screen.getByText('Stock returns')).toBeInTheDocument()
  })

  it('renders one card per insight with its tone stripe', () => {
    const { container } = render(<WhatMoves sensitivity={ROWS} insights={CARDS} loading={false} />)
    expect(screen.getByText(/tax-optimal strategy/i)).toBeInTheDocument()
    expect(screen.getByText(/healthcare gap/i)).toBeInTheDocument()
    expect(container.querySelectorAll('[data-stripe]')).toHaveLength(2)
  })

  it('shows a quiet placeholder while computing with no data yet', () => {
    render(<WhatMoves sensitivity={null} insights={null} loading />)
    expect(screen.getByText(/measuring which levers matter/i)).toBeInTheDocument()
  })

  it('renders nothing with no data and not loading', () => {
    const { container } = render(<WhatMoves sensitivity={null} insights={null} loading={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('omits insight cards when there are none, keeping the tornado', () => {
    render(<WhatMoves sensitivity={ROWS} insights={[]} loading={false} />)
    expect(screen.getByText('Annual expenses')).toBeInTheDocument()
    expect(screen.queryByText(/tax-optimal/i)).not.toBeInTheDocument()
  })
})
