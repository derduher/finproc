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

export function TopBar2({ onAdvanced, actions = true }: { onAdvanced?: () => void; actions?: boolean }) {
  const scenarioName = useStore((s) => s.inputs.scenarioName)
  const [shared, setShared] = useState(false)

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ title: scenarioName, url })
      } else {
        await navigator.clipboard.writeText(url)
      }
      setShared(true)
      window.setTimeout(() => setShared(false), 1800)
    } catch {
      // User dismissed the share sheet, or clipboard denied — leave feedback off.
    }
  }

  return (
    <div className="topbar2">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <Logo />
        <div style={{ width: 1, height: 22, background: 'var(--line)', flex: 'none' }} />
        <div className="chip" style={{ gap: 6, minWidth: 0 }}>
          <span style={{ fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scenarioName}</span>
        </div>
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <button className="btn btn-sm" onClick={onAdvanced}>Advanced</button>
          <button className="btn btn-sm" onClick={share} aria-label={shared ? 'Link copied' : 'Share this plan'}>
            {shared ? 'Copied ✓' : 'Share'}
          </button>
        </div>
      )}
    </div>
  )
}
