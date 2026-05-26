/**
 * Responsive layout tests for AccountsStep (PipeEditor stacking).
 *
 * Uses CSS @media (max-width: 768px) — no JS resize listener, no runtime
 * matchMedia check in the component. Tests assert (a) the data attribute
 * is on the right element and (b) the CSS rule exists in styles.css.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AccountsStep } from './AccountsStep'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'

const css = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf-8')

beforeEach(() => {
  useStore.setState({
    inputs: {
      ...defaultInputs(),
      accounts: [
        {
          id: 'a1',
          name: 'Fidelity 401(k)',
          accountType: 'traditional401k',
          currentBalance: 150_000,
          monthlyContribution: 2000,
          contributionEndAge: 62,
          withdrawalStartAge: 59,
        },
      ],
    },
    ui: { activeStep: 1, displayMode: 'nominal', aesthetic: 'warm', theme: 'light', density: 'comfortable', lastCommittedAt: null },
  })
})

describe('AccountsStep responsive — PipeEditor stacking via CSS', () => {
  it('PipeEditor renders with data-pipe-editor attribute', () => {
    const { container } = render(<AccountsStep />)
    const accountCards = screen.getAllByText(/Fidelity 401\(k\)/)
    const accountCard = accountCards.map(el => el.closest('[role="button"]')).find(Boolean) as HTMLElement | undefined
    if (accountCard) fireEvent.click(accountCard)
    const pipeEditor = container.querySelector('[data-pipe-editor]')
    expect(pipeEditor).not.toBeNull()
  })

  it('PipeEditor does NOT use inline flexDirection (CSS-driven only)', () => {
    const { container } = render(<AccountsStep />)
    const accountCards = screen.getAllByText(/Fidelity 401\(k\)/)
    const accountCard = accountCards.map(el => el.closest('[role="button"]')).find(Boolean) as HTMLElement | undefined
    if (accountCard) fireEvent.click(accountCard)
    const pipeEditor = container.querySelector('[data-pipe-editor]') as HTMLElement
    // Inline flexDirection must NOT be set — CSS governs layout
    expect(pipeEditor.style.flexDirection).toBe('')
  })

  it('styles.css contains @media rule that stacks pipe editor on mobile', () => {
    // The mobile breakpoint must override [data-pipe-editor] flex-direction to column.
    // We assert the @media block opens and a matching override appears before it closes.
    const mediaIdx = css.indexOf('@media (max-width: 768px)')
    expect(mediaIdx).toBeGreaterThan(-1)
    // Walk braces to find the matching close for the media block.
    const openIdx = css.indexOf('{', mediaIdx)
    let depth = 1
    let i = openIdx + 1
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    const block = css.slice(openIdx, i)
    expect(block).toMatch(/\[data-pipe-editor\][^{]*\{[^}]*flex-direction\s*:\s*column/)
  })

  it('styles.css base rule sets [data-pipe-editor] flex-direction row for desktop', () => {
    // Outside any @media block, [data-pipe-editor] should default to row layout
    expect(css).toMatch(/\[data-pipe-editor\][^{]*\{[^}]*flex-direction\s*:\s*row/s)
  })
})
