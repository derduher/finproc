import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stage } from './Stage'

describe('Stage — state="done"', () => {
  it('renders the label', () => {
    render(<Stage state="done" label="parse inputs" eta="2ms" />)
    expect(screen.getByText('parse inputs')).toBeInTheDocument()
  })

  it('renders the eta text', () => {
    render(<Stage state="done" label="parse inputs" eta="2ms" />)
    expect(screen.getByText('2ms')).toBeInTheDocument()
  })

  it('renders a check icon (SVG with done indicator)', () => {
    const { container } = render(<Stage state="done" label="parse inputs" eta="2ms" />)
    const doneIcon = container.querySelector('[data-stage-icon="done"]')
    expect(doneIcon).not.toBeNull()
  })
})

describe('Stage — state="active"', () => {
  it('renders the label', () => {
    render(<Stage state="active" label="project balances" eta="~1.4s" />)
    expect(screen.getByText('project balances')).toBeInTheDocument()
  })

  it('renders a spinner (active icon)', () => {
    const { container } = render(<Stage state="active" label="project balances" eta="~1.4s" />)
    const activeIcon = container.querySelector('[data-stage-icon="active"]')
    expect(activeIcon).not.toBeNull()
  })

  it('label has full-ink color (not muted)', () => {
    const { container } = render(<Stage state="active" label="project balances" eta="~1.4s" />)
    const label = container.querySelector('[data-stage-label]')
    expect(label).not.toBeNull()
    // active label should not have the muted ink-3 color
    expect(label!.getAttribute('data-stage-label')).toBe('active')
  })
})

describe('Stage — state="pending"', () => {
  it('renders the label', () => {
    render(<Stage state="pending" label="aggregate percentiles" eta="—" />)
    expect(screen.getByText('aggregate percentiles')).toBeInTheDocument()
  })

  it('renders an empty circle (pending icon)', () => {
    const { container } = render(<Stage state="pending" label="aggregate percentiles" eta="—" />)
    const pendingIcon = container.querySelector('[data-stage-icon="pending"]')
    expect(pendingIcon).not.toBeNull()
  })

  it('label has muted color', () => {
    const { container } = render(<Stage state="pending" label="aggregate percentiles" eta="—" />)
    const label = container.querySelector('[data-stage-label]')
    expect(label!.getAttribute('data-stage-label')).toBe('pending')
  })
})
