import { describe, it, expect } from 'vitest'
import { clampDomain, zoomDomain, panDomain, ageAtFraction, fractionForClientX } from './pathsZoom'
import type { Domain } from './pathsZoom'

const FULL: [number, number] = [40, 95] // fullMin, fullMax
const MIN_SPAN = 4

describe('clampDomain', () => {
  it('leaves a domain that already fits untouched', () => {
    expect(clampDomain([50, 70], FULL[0], FULL[1], MIN_SPAN)).toEqual([50, 70])
  })

  it('clamps a window that overflows the right edge by shifting it left (keeping span)', () => {
    expect(clampDomain([90, 110], FULL[0], FULL[1], MIN_SPAN)).toEqual([75, 95])
  })

  it('clamps a window that underflows the left edge by shifting it right (keeping span)', () => {
    expect(clampDomain([30, 50], FULL[0], FULL[1], MIN_SPAN)).toEqual([40, 60])
  })

  it('caps a window wider than the full range to the full range', () => {
    expect(clampDomain([20, 120], FULL[0], FULL[1], MIN_SPAN)).toEqual([40, 95])
  })

  it('expands a too-narrow window to minSpan around its center', () => {
    expect(clampDomain([60, 61], FULL[0], FULL[1], MIN_SPAN)).toEqual([58.5, 62.5])
  })
})

describe('zoomDomain', () => {
  const d: Domain = [40, 95]

  it('zooming in (factor > 1) shrinks the window', () => {
    const [min, max] = zoomDomain(d, 2, 67.5, FULL[0], FULL[1], MIN_SPAN)
    expect(max - min).toBeCloseTo((95 - 40) / 2, 5)
  })

  it('keeps the focus age at the same fractional position', () => {
    // focus at the left edge → left edge stays put
    const [min] = zoomDomain(d, 2, 40, FULL[0], FULL[1], MIN_SPAN)
    expect(min).toBeCloseTo(40, 5)
  })

  it('zooming out (factor < 1) widens but never past the full range', () => {
    expect(zoomDomain([50, 60], 0.01, 55, FULL[0], FULL[1], MIN_SPAN)).toEqual([40, 95])
  })

  it('never zooms in past minSpan', () => {
    const [min, max] = zoomDomain([60, 64], 100, 62, FULL[0], FULL[1], MIN_SPAN)
    expect(max - min).toBeCloseTo(MIN_SPAN, 5)
  })
})

describe('panDomain', () => {
  it('shifts the window by the delta without resizing', () => {
    expect(panDomain([50, 70], 5, FULL[0], FULL[1])).toEqual([55, 75])
  })

  it('stops at the right edge, keeping span', () => {
    expect(panDomain([80, 95], 20, FULL[0], FULL[1])).toEqual([80, 95])
  })

  it('stops at the left edge, keeping span', () => {
    expect(panDomain([40, 55], -20, FULL[0], FULL[1])).toEqual([40, 55])
  })
})

describe('ageAtFraction', () => {
  it('maps fraction 0 / 0.5 / 1 across the domain', () => {
    expect(ageAtFraction([50, 70], 0)).toBe(50)
    expect(ageAtFraction([50, 70], 0.5)).toBe(60)
    expect(ageAtFraction([50, 70], 1)).toBe(70)
  })
})

describe('fractionForClientX', () => {
  it('maps a client x within the rect to a 0..1 fraction', () => {
    expect(fractionForClientX({ left: 100, width: 200 }, 200)).toBeCloseTo(0.5, 5)
  })

  it('clamps below 0 and above 1', () => {
    expect(fractionForClientX({ left: 100, width: 200 }, 50)).toBe(0)
    expect(fractionForClientX({ left: 100, width: 200 }, 400)).toBe(1)
  })

  it('returns 0 for a zero-width rect rather than NaN', () => {
    expect(fractionForClientX({ left: 100, width: 0 }, 150)).toBe(0)
  })
})
