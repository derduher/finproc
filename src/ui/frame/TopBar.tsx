import { useEffect, useRef, useState } from 'react'
import { Logo } from './Logo'
import { useStore } from '../../store'
import { useScenarios } from '../../hooks/useScenarios'
import { Seg } from '../shared/Field'

const DISPLAY_OPTIONS = [
  { value: 'nominal', label: 'nominal' },
  { value: 'real', label: 'real' },
]

const AESTHETIC_OPTIONS = [
  { value: 'warm', label: 'warm' },
  { value: 'cool', label: 'cool' },
  { value: 'mono', label: 'mono' },
]

function formatRelativeTime(now: number, then: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

function AutoSaved({ at }: { at: number }) {
  const [tick, setTick] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="muted" style={{ fontSize: 12 }}>
      · auto-saved {formatRelativeTime(tick, at)}
    </div>
  )
}

export function TopBar() {
  const scenarioName = useStore((s) => s.inputs.scenarioName)
  const inputs = useStore((s) => s.inputs)
  const displayMode = useStore((s) => s.ui.displayMode)
  const setDisplayMode = useStore((s) => s.setDisplayMode)
  const aesthetic = useStore((s) => s.ui.aesthetic)
  const setAesthetic = useStore((s) => s.setAesthetic)
  const theme = useStore((s) => s.ui.theme)
  const setTheme = useStore((s) => s.setTheme)
  const lastCommittedAt = useStore((s) => s.ui.lastCommittedAt)
  const { scenarios, saveScenario, loadScenario } = useScenarios()

  const [helpOpen, setHelpOpen] = useState(false)
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false)
  const chipRef = useRef<HTMLDivElement>(null)

  // Close the scenario menu when clicking outside it.
  useEffect(() => {
    if (!scenarioMenuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!chipRef.current?.contains(e.target as Node)) setScenarioMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [scenarioMenuOpen])

  return (
    <div
      aria-label="Top toolbar"
      className="shell-desktop-only"
      style={{
        // display owned by .shell-desktop-only (see styles.css).
        height: 56,
        borderBottom: '1px solid var(--line)',
        alignItems: 'center',
        padding: '0 24px',
        gap: 12,
        background: 'var(--bg)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <Logo />
        <div ref={chipRef} style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <button
            type="button"
            className="chip"
            aria-label="Current scenario"
            aria-haspopup="menu"
            aria-expanded={scenarioMenuOpen}
            onClick={() => setScenarioMenuOpen((v) => !v)}
            style={{ background: 'transparent', cursor: 'pointer', font: 'inherit' }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" style={{ marginRight: 2 }}>
              <circle cx="5" cy="5" r="3" fill="var(--good)" />
            </svg>
            {scenarioName}
            <svg width="9" height="9" viewBox="0 0 9 9" style={{ marginLeft: 2 }} aria-hidden="true">
              <path d="M2 3 L4.5 6 L7 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          {scenarioMenuOpen && (
            <div
              role="menu"
              aria-label="Scenarios"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 6,
                minWidth: 220,
                background: 'var(--bg-elev)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                zIndex: 10,
                padding: 4,
              }}
            >
              {scenarios.length === 0 ? (
                <div className="muted" style={{ fontSize: 12, padding: '8px 10px' }}>
                  no saved scenarios yet
                </div>
              ) : (
                scenarios.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitem"
                    className="btn btn-ghost btn-sm"
                    style={{ display: 'flex', justifyContent: 'flex-start', width: '100%', textAlign: 'left' }}
                    onClick={() => {
                      loadScenario(s.id)
                      setScenarioMenuOpen(false)
                    }}
                  >
                    {s.name}
                  </button>
                ))
              )}
              <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
              <button
                type="button"
                role="menuitem"
                className="btn btn-ghost btn-sm"
                style={{ display: 'flex', justifyContent: 'flex-start', width: '100%', textAlign: 'left' }}
                onClick={() => {
                  saveScenario(inputs)
                  setScenarioMenuOpen(false)
                }}
              >
                + Save current as new scenario
              </button>
            </div>
          )}
          {lastCommittedAt !== null && <AutoSaved at={lastCommittedAt} />}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <Seg
        options={AESTHETIC_OPTIONS}
        value={aesthetic}
        onChange={(v) => setAesthetic(v as 'warm' | 'cool' | 'mono')}
        aria-label="Aesthetic"
      />

      <Seg
        options={DISPLAY_OPTIONS}
        value={displayMode}
        onChange={(v) => setDisplayMode(v as 'nominal' | 'real')}
        aria-label="Display mode"
      />

      <button
        type="button"
        className="btn btn-sm btn-icon"
        aria-label={`Toggle theme (current: ${theme})`}
        title={`Toggle theme (current: ${theme})`}
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      >
        {theme === 'light' ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M11 7.5 A 4.5 4.5 0 1 1 6.5 3 A 3.5 3.5 0 0 0 11 7.5 Z" fill="currentColor" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="3" fill="currentColor" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className="btn btn-sm"
        onClick={() => {
          navigator.clipboard?.writeText(window.location.href)
        }}
      >
        Share
      </button>

      <button
        type="button"
        className="btn btn-sm btn-icon"
        aria-label="Help"
        title="Help"
        onClick={() => setHelpOpen(true)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.5 5.5 Q 7 3.5, 8.5 5.5 T 7 8 V 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="7" cy="10.5" r="0.7" fill="currentColor" />
        </svg>
      </button>

      {helpOpen && (
        <div
          role="dialog"
          aria-label="Help"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => setHelpOpen(false)}
        >
          <div
            style={{
              background: 'var(--bg-elev)',
              color: 'var(--ink)',
              padding: 24,
              borderRadius: 8,
              maxWidth: 480,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>How this works</h3>
            <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              This is a Monte-Carlo retirement projector. It runs 1,000 simulations of
              your portfolio across stock-market and inflation scenarios, drawing rates
              from your breakpoint segments. Edit inputs on each step; the right-rail
              preview re-runs as you go.
            </p>
            <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Toggle <strong>nominal</strong> ↔ <strong>real</strong> in the top bar to
              switch between future and today's dollars. Pick an aesthetic and theme to
              taste. Your scenario is auto-saved to the URL — copy it to share.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-primary" onClick={() => setHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        aria-label="User"
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: 'var(--accent-soft)',
          color: 'var(--accent-ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
          fontSize: 12,
        }}
      >
        ZK
      </div>
    </div>
  )
}
