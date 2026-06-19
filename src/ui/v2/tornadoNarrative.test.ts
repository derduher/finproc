import { describe, it, expect } from 'vitest'
import { tornadoNarrative } from './tornadoNarrative'
import type { SensitivityResult } from '../../schema'

describe('tornadoNarrative', () => {
  it('names the top lever and its swing in percentage points', () => {
    const data: SensitivityResult[] = [
      { label: 'Stock returns', sub: '±20%', loDelta: -0.1, hiDelta: 0.14 },
      { label: 'Annual expenses', sub: '±20%', loDelta: 0.08, hiDelta: -0.06 },
    ]
    const out = tornadoNarrative(data)
    expect(out?.lead).toContain('Stock returns')
    expect(out?.lead).toContain('±20%')
    expect(out?.lead).toContain('14 percentage points')
  })

  it('uses the larger of the two deltas as the swing', () => {
    const data: SensitivityResult[] = [
      { label: 'Annual expenses', sub: '±20%', loDelta: 0.05, hiDelta: -0.18 },
    ]
    expect(tornadoNarrative(data)?.lead).toContain('18 percentage points')
  })

  it('keeps the perturbation phrasing for non-percent levers (retirement age)', () => {
    const data: SensitivityResult[] = [
      { label: 'Retirement age', sub: '±2 years', loDelta: -0.2, hiDelta: 0.16 },
    ]
    const lead = tornadoNarrative(data)?.lead ?? ''
    expect(lead).toContain('Retirement age')
    expect(lead).toContain('±2 years')
    expect(lead).toContain('20 percentage points')
  })

  it('returns null for empty data', () => {
    expect(tornadoNarrative([])).toBeNull()
  })

  it('reports a stable plan when nothing moves the needle', () => {
    const data: SensitivityResult[] = [
      { label: 'Inflation', sub: '±20%', loDelta: 0.002, hiDelta: -0.001 },
    ]
    const lead = tornadoNarrative(data)?.lead ?? ''
    expect(lead).toMatch(/stable|doesn't move|hardly/i)
  })
})
