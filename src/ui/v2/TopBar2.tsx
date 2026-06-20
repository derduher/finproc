/**
 * TopBar2 — lightweight top bar for the single-screen v2 model: brand, the named
 * plan, and Advanced / Share affordances.
 *
 * `actions` is false on the guided first-run screen (no plan to share/customise
 * yet), so the otherwise-inert Advanced/Share buttons are hidden (#7). The action
 * cluster never shrinks, so Share stays on-screen in iPhone portrait (#8).
 */
import { useState } from 'react'
import { useStore } from '../../store'
import { Logo } from '../frame/Logo'

/** Legacy clipboard fallback for when the async Clipboard API is unavailable or blocked. */
function copyViaTextarea(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/**
 * Auto-save status. The plan round-trips to the URL on a debounce, so once the
 * first commit lands we can honestly show "Saved HH:MM" — the shareable URL *is*
 * the saved state. Shows a quiet "Saving…" until the first commit.
 */
function SaveStatus({ committedAt }: { committedAt: number | null }) {
  if (committedAt == null) {
    return <span className="muted" style={{ fontSize: 12, flex: 'none' }}>Saving…</span>
  }
  const time = new Date(committedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <span className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, flex: 'none' }}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="var(--good)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Saved {time}
    </span>
  )
}

export function TopBar2({
  onAdvanced,
  actions = true,
  rightNote,
}: {
  onAdvanced?: () => void
  actions?: boolean
  /** Muted note shown on the right when `actions` is false (e.g. first-run "takes about a minute"). */
  rightNote?: string
}) {
  const scenarioName = useStore((s) => s.inputs.scenarioName)
  const lastCommittedAt = useStore((s) => s.ui.lastCommittedAt)
  const [shared, setShared] = useState(false)

  const flash = () => {
    setShared(true)
    window.setTimeout(() => setShared(false), 1800)
  }

  const share = async () => {
    const url = window.location.href
    // On mobile, prefer the native share sheet.
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ title: scenarioName, url })
        flash()
        return
      } catch {
        // Dismissed or unsupported — fall through to copy.
      }
    }
    // Synchronous copy runs inside the click gesture, so it stays reliable even
    // where the async Clipboard API is blocked (the source of "no feedback", #6).
    let ok = copyViaTextarea(url)
    if (!ok && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        ok = true
      } catch {
        ok = false
      }
    }
    if (ok) flash()
  }

  return (
    <div className="topbar2">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <Logo />
        <div style={{ width: 1, height: 22, background: 'var(--line)', flex: 'none' }} />
        <div className="chip" style={{ gap: 6, minWidth: 0 }}>
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden style={{ flex: 'none', color: 'var(--ink-3)' }}><path d="M2 2h6l2 2v6H2z" fill="none" stroke="currentColor" strokeWidth="1" /><path d="M4 2v3h3" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          <span style={{ fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scenarioName}</span>
        </div>
        {actions && <SaveStatus committedAt={lastCommittedAt} />}
      </div>
      {actions ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <button className="btn btn-sm" onClick={onAdvanced}>Advanced</button>
          <button className="btn btn-sm" onClick={share} aria-label={shared ? 'Link copied' : 'Share this plan'}>
            {shared ? 'Copied ✓' : 'Share'}
          </button>
        </div>
      ) : rightNote ? (
        <span className="muted" style={{ fontSize: 12, flex: 'none' }}>{rightNote}</span>
      ) : null}
    </div>
  )
}
