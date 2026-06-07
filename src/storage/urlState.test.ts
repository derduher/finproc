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
      baselineExpenses: [
        { id: 'general', label: 'General living', category: 'other' as const, annualAmountPresentDollars: 55000 },
      ],
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

  it('round-trips a custom scenario name', () => {
    const inp = { ...defaultInputs(), scenarioName: 'Retire at 60' }
    const decoded = decompressInputs(compressInputs(inp))
    expect(decoded?.scenarioName).toBe('Retire at 60')
  })

  it('rejects decoded payload with empty scenario name', async () => {
    const bad = { ...defaultInputs(), scenarioName: '' }
    const { compressToEncodedURIComponent } = await import('lz-string')
    const encoded = compressToEncodedURIComponent(JSON.stringify(bad))
    expect(decompressInputs(encoded)).toBeNull()
  })
})

describe('urlState — base64 fallback', () => {
  it('decompresses payload produced by compressToBase64 (fallback path)', async () => {
    const { compressToBase64 } = await import('lz-string')
    const inp = { ...defaultInputs(), scenarioName: 'From base64' }
    const encoded = compressToBase64(JSON.stringify(inp))
    const decoded = decompressInputs(encoded)
    expect(decoded?.scenarioName).toBe('From base64')
  })

  it('still prefers EncodedURIComponent decode when payload is encoded that way', () => {
    const inp = { ...defaultInputs(), scenarioName: 'From uri-safe' }
    const encoded = compressInputs(inp)
    const decoded = decompressInputs(encoded)
    expect(decoded?.scenarioName).toBe('From uri-safe')
  })

  it('decompressUiPrefs decompresses payload produced by compressToBase64', async () => {
    const { compressToBase64 } = await import('lz-string')
    const { decompressUiPrefs } = await import('./urlState')
    const prefs = { aesthetic: 'mono' as const, theme: 'dark' as const, density: 'compact' as const }
    const encoded = compressToBase64(JSON.stringify(prefs))
    expect(decompressUiPrefs(encoded)).toEqual(prefs)
  })
})

describe('urlState — UI prefs round-trip', () => {
  it('compressUiPrefs / decompressUiPrefs round-trips aesthetic/theme/density', async () => {
    const { compressUiPrefs, decompressUiPrefs } = await import('./urlState')
    const prefs = { aesthetic: 'cool' as const, theme: 'dark' as const, density: 'compact' as const }
    const decoded = decompressUiPrefs(compressUiPrefs(prefs))
    expect(decoded).toEqual(prefs)
  })

  it('decompressUiPrefs returns null for invalid string', async () => {
    const { decompressUiPrefs } = await import('./urlState')
    expect(decompressUiPrefs('garbage')).toBeNull()
  })

  it('decompressUiPrefs rejects payload with unknown aesthetic', async () => {
    const { decompressUiPrefs } = await import('./urlState')
    const { compressToEncodedURIComponent } = await import('lz-string')
    const bad = compressToEncodedURIComponent(JSON.stringify({ aesthetic: 'neon', theme: 'light', density: 'comfortable' }))
    expect(decompressUiPrefs(bad)).toBeNull()
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
