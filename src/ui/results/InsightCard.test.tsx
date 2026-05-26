import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InsightCard } from './InsightCard'

describe('InsightCard — content', () => {
  it('renders the title', () => {
    render(
      <InsightCard
        tone="good"
        title="Tax-optimal strategy is paying off"
        body="Lifts success by 3pp."
        cta="See strategy"
      />
    )
    expect(screen.getByText(/Tax-optimal strategy is paying off/)).toBeInTheDocument()
  })

  it('renders the body text', () => {
    render(
      <InsightCard
        tone="good"
        title="Test title"
        body="Lifts success by 3pp."
        cta="See strategy"
      />
    )
    expect(screen.getByText(/Lifts success by 3pp/)).toBeInTheDocument()
  })

  it('renders the CTA button', () => {
    render(
      <InsightCard
        tone="good"
        title="Test title"
        body="Some body text."
        cta="See strategy"
      />
    )
    expect(screen.getByRole('button', { name: /see strategy/i })).toBeInTheDocument()
  })
})

describe('InsightCard — tone stripe', () => {
  it('good tone renders a stripe with good color', () => {
    const { container } = render(
      <InsightCard tone="good" title="T" body="B" cta="C" />
    )
    const stripe = container.querySelector('[data-stripe]')
    expect(stripe).not.toBeNull()
    expect(stripe!.getAttribute('data-stripe')).toBe('good')
  })

  it('warn tone renders a stripe with warn color', () => {
    const { container } = render(
      <InsightCard tone="warn" title="T" body="B" cta="C" />
    )
    const stripe = container.querySelector('[data-stripe]')
    expect(stripe!.getAttribute('data-stripe')).toBe('warn')
  })

  it('accent tone renders a stripe with accent color', () => {
    const { container } = render(
      <InsightCard tone="accent" title="T" body="B" cta="C" />
    )
    const stripe = container.querySelector('[data-stripe]')
    expect(stripe!.getAttribute('data-stripe')).toBe('accent')
  })
})

describe('InsightCard — icon tile', () => {
  it('renders an icon SVG', () => {
    const { container } = render(
      <InsightCard tone="good" title="T" body="B" cta="C" />
    )
    const icons = container.querySelectorAll('svg')
    expect(icons.length).toBeGreaterThan(0)
  })
})
