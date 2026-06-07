import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DisclaimerBanner, DISCLAIMER_STORAGE_KEY } from './DisclaimerBanner'

describe('DisclaimerBanner', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('warns that this is a vibe-coded app and not financial advice', () => {
    render(<DisclaimerBanner />)
    expect(screen.getByText(/vibe.?coded/i)).toBeInTheDocument()
    expect(screen.getByText(/not financial advice/i)).toBeInTheDocument()
  })

  it('is announced as an alert for assistive tech', () => {
    render(<DisclaimerBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('disappears when dismissed and remembers the choice', async () => {
    const user = userEvent.setup()
    render(<DisclaimerBanner />)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(localStorage.getItem(DISCLAIMER_STORAGE_KEY)).toBe('1')
  })

  it('stays hidden on a later mount once dismissed', () => {
    localStorage.setItem(DISCLAIMER_STORAGE_KEY, '1')
    render(<DisclaimerBanner />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
