/**
 * SheetField — one input that adapts to the viewport:
 *
 *  - **Desktop** renders its editor (`children`) inline, exactly as before.
 *  - **Mobile** renders a full-width tap target showing the current value and
 *    opens a bottom sheet containing the same editor — large, easy to hit, and
 *    with room for values like "100%" that the cramped inline pills clip.
 *
 * The editor inside the sheet edits live (it's the same controlled control), so
 * there's no separate draft to reconcile — "Done" just closes the sheet. Reuses
 * the existing `.sheet` / `.ex-scrim` styles (see styles-v2.css) so it matches
 * the Result Explorer's mobile edit sheet.
 */
import { useState, type ReactNode } from 'react'
import { useIsMobile } from './useIsMobile'
import { useDialogA11y } from './useDialogA11y'

export interface SheetFieldProps {
  /** Accessible label, also used as the sheet title. */
  label: string
  /** What the mobile trigger shows (the current value, formatted). */
  display: ReactNode
  /** The editor control — rendered inline on desktop, inside the sheet on mobile. */
  children: ReactNode
  /** Optional helper text shown under the editor in the sheet. */
  note?: ReactNode
  /** Override the trigger button class (e.g. to embed it inside an existing pill). */
  triggerClassName?: string
}

/** The bottom-sheet shell: dimmed backdrop + slide-up panel with a grab handle. */
function MobileSheet({ title, note, onClose, children }: { title: string; note?: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useDialogA11y<HTMLDivElement>(onClose, { lockScroll: true })
  return (
    <>
      <div className="ex-scrim" aria-hidden onClick={onClose} />
      <div ref={ref} className="sheet sheet-field" role="dialog" aria-modal="true" aria-label={`Edit ${title}`}>
        <div className="grab" />
        <div className="label" style={{ marginBottom: 10 }}>{title}</div>
        <div className="sheet-field-body">{children}</div>
        {note && <div className="micro" style={{ marginTop: 10, lineHeight: 1.45 }}>{note}</div>}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}

export function SheetField({ label, display, children, note, triggerClassName = 'sheet-trigger' }: SheetFieldProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  // Desktop: inline editor, unchanged.
  if (!isMobile) return <>{children}</>

  // Mobile: a tap target that opens the editor in a bottom sheet.
  return (
    <>
      <button type="button" className={triggerClassName} aria-label={`Edit ${label}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="sheet-trigger-v">{display}</span>
      </button>
      {open && (
        <MobileSheet title={label} note={note} onClose={() => setOpen(false)}>
          {children}
        </MobileSheet>
      )}
    </>
  )
}
