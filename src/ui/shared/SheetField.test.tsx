import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SheetField } from './SheetField'

function setViewport(isMobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: isMobile,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('SheetField', () => {
  it('renders the editor inline on desktop (no trigger, no sheet)', () => {
    setViewport(false)
    render(
      <SheetField label="Stock allocation" display="100%">
        <input aria-label="Stock allocation" defaultValue={100} />
      </SheetField>,
    )
    expect(screen.getByLabelText('Stock allocation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit Stock allocation/ })).not.toBeInTheDocument()
  })

  describe('on mobile', () => {
    beforeEach(() => setViewport(true))

    it('shows a trigger with the display value and hides the editor until tapped', () => {
      render(
        <SheetField label="Stock allocation" display="100%">
          <input aria-label="Stock allocation" defaultValue={100} />
        </SheetField>,
      )
      expect(screen.getByRole('button', { name: /Edit Stock allocation/ })).toHaveTextContent('100%')
      expect(screen.queryByLabelText('Stock allocation')).not.toBeInTheDocument()
    })

    it('opens the sheet with the editor on tap, then closes it on Done', () => {
      render(
        <SheetField label="Stock allocation" display="100%">
          <input aria-label="Stock allocation" defaultValue={100} />
        </SheetField>,
      )
      fireEvent.click(screen.getByRole('button', { name: /Edit Stock allocation/ }))
      expect(screen.getByRole('dialog', { name: 'Edit Stock allocation' })).toBeInTheDocument()
      expect(screen.getByLabelText('Stock allocation')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes the sheet on Escape (dialog a11y)', () => {
      render(
        <SheetField label="Stock allocation" display="100%">
          <input aria-label="Stock allocation" defaultValue={100} />
        </SheetField>,
      )
      fireEvent.click(screen.getByRole('button', { name: /Edit Stock allocation/ }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('marks the sheet as a modal dialog', () => {
      render(
        <SheetField label="Stock allocation" display="100%">
          <input aria-label="Stock allocation" defaultValue={100} />
        </SheetField>,
      )
      fireEvent.click(screen.getByRole('button', { name: /Edit Stock allocation/ }))
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('edits flow through the live control inside the sheet', () => {
      const onChange = vi.fn()
      render(
        <SheetField label="Stock allocation" display="100%">
          <input aria-label="Stock allocation" value={100} onChange={(e) => onChange(e.target.value)} />
        </SheetField>,
      )
      fireEvent.click(screen.getByRole('button', { name: /Edit Stock allocation/ }))
      fireEvent.change(screen.getByLabelText('Stock allocation'), { target: { value: '80' } })
      expect(onChange).toHaveBeenCalledWith('80')
    })
  })
})
