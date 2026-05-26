/**
 * Verifies that .flow-dash and .flow-pulse animations respect
 * prefers-reduced-motion: reduce (as a CSS media query in styles.css).
 *
 * jsdom does not apply stylesheets, so we test the CSS source directly.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'styles.css'), 'utf-8')

describe('prefers-reduced-motion — styles.css', () => {
  it('contains a prefers-reduced-motion media query', () => {
    expect(css).toMatch(/prefers-reduced-motion/)
  })

  it('disables flow-dash animation under prefers-reduced-motion', () => {
    // The CSS must contain a rule that sets animation to none for .flow-dash
    // inside a prefers-reduced-motion: reduce media query
    const reducedBlock = css.slice(css.indexOf('prefers-reduced-motion'))
    expect(reducedBlock).toMatch(/flow-dash/)
    expect(reducedBlock).toMatch(/animation.*none|none.*animation/)
  })

  it('disables flow-pulse animation under prefers-reduced-motion', () => {
    const reducedBlock = css.slice(css.indexOf('prefers-reduced-motion'))
    expect(reducedBlock).toMatch(/flow-pulse/)
    expect(reducedBlock).toMatch(/animation.*none|none.*animation/)
  })
})
