/**
 * TopBar2 — lightweight top bar for the single-screen v2 model: brand, the named
 * plan, and Advanced / Share affordances.
 */
import { useStore } from '../../store'
import { Logo } from '../frame/Logo'

export function TopBar2({ onAdvanced }: { onAdvanced?: () => void }) {
  const scenarioName = useStore((s) => s.inputs.scenarioName)
  return (
    <div className="topbar2">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Logo />
        <div style={{ width: 1, height: 22, background: 'var(--line)' }} />
        <div className="chip" style={{ gap: 6 }}>
          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{scenarioName}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn btn-sm" onClick={onAdvanced}>Advanced</button>
        <button className="btn btn-sm">Share</button>
      </div>
    </div>
  )
}
