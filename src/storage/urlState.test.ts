import { describe, it, expect } from 'vitest'
import { compressInputs, decompressInputs, isShareable } from './urlState'
import { defaultInputs } from '../schema'

describe('urlState — round-trip', () => {
  it('compress then decompress returns equivalent inputs', () => {
    const inp = defaultInputs()
    const encoded = compressInputs(inp)
    const decoded = decompressInputs(encoded)
    expect(decoded).toEqual(inp)
  })

  it('round-trips with non-default values', () => {
    const inp = {
      ...defaultInputs(),
      annualExpenses: 55000,
      person: { ...defaultInputs().person, currentAge: 45, maxAge: 90 },
    }
    const decoded = decompressInputs(compressInputs(inp))
    expect(decoded?.annualExpenses).toBe(55000)
    expect(decoded?.person.currentAge).toBe(45)
  })

  it('decompressInputs returns null for invalid string', () => {
    expect(decompressInputs('not-valid-lzstring')).toBeNull()
  })
})

describe('urlState — isShareable', () => {
  it('default inputs → URL is under 8000 chars', () => {
    const encoded = compressInputs(defaultInputs())
    expect(isShareable(encoded)).toBe(true)
    expect(encoded.length).toBeLessThan(8000)
  })

  it('isShareable returns false for very long strings', () => {
    const longString = 'a'.repeat(9000)
    expect(isShareable(longString)).toBe(false)
  })
})
