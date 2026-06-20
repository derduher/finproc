import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useContainerWidth } from './useContainerWidth'

function Probe() {
  const [ref, width] = useContainerWidth<HTMLDivElement>(800)
  return <div ref={ref} data-testid="probe">{width}</div>
}

describe('useContainerWidth', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the fallback when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('800')
  })

  it('updates to the observed content width', () => {
    class RO {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentRect: { width: 420 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', RO)
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('420')
  })
})
