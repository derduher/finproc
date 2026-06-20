import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { useDialogA11y } from './useDialogA11y'

function Dialog({ onClose, lockScroll }: { onClose: () => void; lockScroll?: boolean }) {
  const ref = useDialogA11y<HTMLDivElement>(onClose, { lockScroll })
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Test dialog">
      <input aria-label="first" />
      <button>Done</button>
    </div>
  )
}

function Harness({ lockScroll }: { lockScroll?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      {open && <Dialog onClose={() => setOpen(false)} lockScroll={lockScroll} />}
    </>
  )
}

describe('useDialogA11y', () => {
  it('moves focus into the dialog on open', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    expect(document.activeElement).toBe(screen.getByLabelText('first'))
  })

  it('closes on Escape', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('restores focus to the opener on close', () => {
    render(<Harness />)
    const opener = screen.getByText('open')
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).not.toBe(opener)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.activeElement).toBe(opener)
  })

  it('locks body scroll only when requested, and restores it on close', () => {
    const { rerender } = render(<Harness lockScroll />)
    expect(document.body.style.overflow).toBe('')
    fireEvent.click(screen.getByText('open'))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.body.style.overflow).toBe('')
    rerender(<Harness />)
  })

  it('does not lock body scroll when lockScroll is false', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    expect(document.body.style.overflow).toBe('')
  })

  it('wraps focus to the last element on Shift+Tab from the first', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    const first = screen.getByLabelText('first')
    const done = screen.getByText('Done')
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(done)
  })
})
