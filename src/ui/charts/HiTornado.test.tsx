import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HiTornado } from './HiTornado'
import type { SensitivityResult } from '../../schema'

const baseData: SensitivityResult[] = [
  { label: 'Stock returns', sub: 'initial segment', loDelta: -0.18, hiDelta: 0.14 },
  { label: 'Annual expenses', sub: 'baseline', loDelta: -0.12, hiDelta: 0.11 },
  { label: 'Inflation', sub: '±20%', loDelta: -0.05, hiDelta: 0.04 },
]

describe('HiTornado — row labels', () => {
  it('renders each row label', () => {
    render(<HiTornado data={baseData} />)
    expect(screen.getByText('Stock returns')).toBeInTheDocument()
    expect(screen.getByText('Annual expenses')).toBeInTheDocument()
    expect(screen.getByText('Inflation')).toBeInTheDocument()
  })

  it('renders sub text for rows that have it', () => {
    render(<HiTornado data={baseData} />)
    expect(screen.getByText('initial segment')).toBeInTheDocument()
    expect(screen.getByText('baseline')).toBeInTheDocument()
    expect(screen.getByText('±20%')).toBeInTheDocument()
  })
})

describe('HiTornado — hot row', () => {
  it('top row (index 0) uses hot/accent fill on the hi bar', () => {
    const { container } = render(<HiTornado data={baseData} />)
    const hotBars = container.querySelectorAll('[data-hot="true"]')
    expect(hotBars.length).toBeGreaterThan(0)
  })

  it('non-top rows do not have hot attribute', () => {
    const { container } = render(<HiTornado data={baseData} />)
    const hotBars = container.querySelectorAll('[data-hot="true"]')
    // Only row 0 should be hot
    expect(hotBars.length).toBe(2) // lo + hi bar for row 0
  })
})

describe('HiTornado — bar widths', () => {
  it('renders bars (rects) for each row', () => {
    const { container } = render(<HiTornado data={baseData} />)
    // Each row has lo + hi bar (when delta != 0)
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBeGreaterThanOrEqual(baseData.length)
  })
})
