/**
 * useDialogA11y — the keyboard/focus contract a `role="dialog"` needs, shared by
 * the mobile SheetField and the Result Explorer edit popover.
 *
 * Mount the dialog conditionally and attach the returned `ref` to its container.
 * While mounted it:
 *  - moves focus into the dialog (first focusable element, else the container),
 *  - traps Tab / Shift+Tab inside it,
 *  - closes on Escape,
 *  - optionally locks body scroll (for the full-screen mobile bottom sheet),
 *  - restores focus to whatever was focused before it opened, on unmount.
 *
 * Pair with `aria-modal="true"` on the container.
 */
import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])'

export interface DialogA11yOptions {
  /** Prevent the page behind the dialog from scrolling (use for the mobile sheet). */
  lockScroll?: boolean
}

export function useDialogA11y<T extends HTMLElement>(
  onClose: () => void,
  { lockScroll = false }: DialogA11yOptions = {},
) {
  const ref = useRef<T>(null)
  // Keep the latest onClose without re-running the mount effect.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const previouslyFocused = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
      )

    // Move focus in: first focusable, else the container itself.
    const first = focusables()[0]
    if (first) first.focus()
    else {
      node.tabIndex = -1
      node.focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === firstEl || !node.contains(active))) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    let restoreOverflow: string | null = null
    if (lockScroll && typeof document !== 'undefined') {
      restoreOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (restoreOverflow !== null) document.body.style.overflow = restoreOverflow
      previouslyFocused?.focus?.()
    }
  }, [lockScroll])

  return ref
}
