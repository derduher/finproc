import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LoadingState } from './LoadingState'
import type { ProgressEvent } from '../../sim/montecarlo'

describe('LoadingState — no progress (bare loading)', () => {
  it('renders the loading card', () => {
    render(<LoadingState />)
    expect(screen.getByText(/simulation progress/i)).toBeInTheDocument()
  })

  it('shows all 4 stage labels', () => {
    render(<LoadingState />)
    expect(screen.getByText(/parse inputs/i)).toBeInTheDocument()
    expect(screen.getByText(/sample rates/i)).toBeInTheDocument()
    expect(screen.getByText(/project balances/i)).toBeInTheDocument()
    expect(screen.getByText(/aggregate percentiles/i)).toBeInTheDocument()
  })

  it('shows skeleton tiles', () => {
    const { container } = render(<LoadingState />)
    const skels = container.querySelectorAll('.skel')
    expect(skels.length).toBeGreaterThan(0)
  })
})

describe('LoadingState — with progress prop', () => {
  const projectProgress: ProgressEvent = {
    stage: 'project',
    done: 637,
    total: 1000,
  }

  it('shows run count from progress', () => {
    render(<LoadingState progress={projectProgress} />)
    expect(screen.getByText(/637/)).toBeInTheDocument()
  })

  it('shows total run count', () => {
    const { container } = render(<LoadingState progress={projectProgress} />)
    expect(container.textContent).toMatch(/1,000/)
  })

  it('progress bar width reflects done/total', () => {
    const { container } = render(<LoadingState progress={projectProgress} />)
    const bar = container.querySelector('[data-testid="progress-bar"]')
    expect(bar).not.toBeNull()
    const style = (bar as HTMLElement).style.width
    // 637/1000 = 63.7%
    expect(parseFloat(style)).toBeCloseTo(63.7, 0)
  })

  it('parse stage is done when stage=project', () => {
    const { container } = render(<LoadingState progress={projectProgress} />)
    const parseDot = container.querySelector('[data-stage-icon="done"]')
    expect(parseDot).not.toBeNull()
  })

  it('project stage is active when stage=project', () => {
    const { container } = render(<LoadingState progress={projectProgress} />)
    const activeDot = container.querySelector('[data-stage-icon="active"]')
    expect(activeDot).not.toBeNull()
  })

  it('aggregate stage is pending when stage=project', () => {
    const { container } = render(<LoadingState progress={projectProgress} />)
    const pendingDots = container.querySelectorAll('[data-stage-icon="pending"]')
    expect(pendingDots.length).toBeGreaterThan(0)
  })
})

describe('LoadingState — Cancel button', () => {
  it('renders Cancel button', () => {
    render(<LoadingState onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('clicking Cancel calls onCancel', () => {
    const onCancel = vi.fn()
    render(<LoadingState onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

describe('LoadingState — seed display', () => {
  it('shows seed hex when provided', () => {
    render(<LoadingState seedHex="0x4f2a" />)
    expect(screen.getByText(/0x4f2a/)).toBeInTheDocument()
  })
})
