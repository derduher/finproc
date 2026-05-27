/**
 * Tests for UrlParseFailedBanner — shown when a shared URL couldn't be decoded.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UrlParseFailedBanner } from './UrlParseFailedBanner'

describe('UrlParseFailedBanner', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(<UrlParseFailedBanner visible={false} onDismiss={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a message about a failed scenario load when visible', () => {
    render(<UrlParseFailedBanner visible={true} onDismiss={() => {}} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert').textContent).toMatch(/couldn.?t load|failed.*scenario|invalid/i)
  })

  it('has a dismiss button that calls onDismiss', () => {
    const onDismiss = vi.fn()
    render(<UrlParseFailedBanner visible={true} onDismiss={onDismiss} />)
    const btn = screen.getByRole('button', { name: /dismiss|close/i })
    fireEvent.click(btn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
