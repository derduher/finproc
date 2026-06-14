import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useStore, initialFirstRun } from '../../store'
import { defaultInputs } from '../../schema'
import { FirstRunBanner } from './FirstRunBanner'

beforeEach(() => {
  useStore.setState({
    inputs: defaultInputs(),
    ui: {
      displayMode: 'nominal', aesthetic: 'warm', theme: 'light', density: 'comfortable',
      lastCommittedAt: null,
      firstRun: { ...initialFirstRun(), active: true },
    },
  })
})

describe('FirstRunBanner', () => {
  it('frames the rough phase as honestly provisional', () => {
    render(<FirstRunBanner phase="rough" />)
    expect(screen.getByText(/honestly rough/i)).toBeInTheDocument()
  })

  it('reassures once confirmed', () => {
    render(<FirstRunBanner phase="confirmed" />)
    expect(screen.getByText(/built on your figures/i)).toBeInTheDocument()
  })

  it('dismisses to nothing', () => {
    const { container } = render(<FirstRunBanner phase="rough" />)
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(useStore.getState().ui.firstRun.bannerDismissed).toBe(true)
    expect(container.querySelector('.firstrun-banner')).toBeNull()
  })
})
