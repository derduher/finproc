/**
 * DisclaimerBanner — a prominent, dismissable notice that this is a hobby /
 * "vibe-coded" projection toy, not financial advice. Dismissal is remembered
 * per-device in localStorage so it nags once, not every visit. Self-contained
 * (no store/URL wiring) and presentational-only.
 */
import { useState } from 'react'

export const DISCLAIMER_STORAGE_KEY = 'finproc.disclaimer.dismissed.v1'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISCLAIMER_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(readDismissed)
  if (dismissed) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISCLAIMER_STORAGE_KEY, '1')
    } catch {
      /* private mode / storage disabled — dismiss for this session only */
    }
    setDismissed(true)
  }

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: 'var(--bad-soft)',
        borderBottom: '1px solid var(--bad)',
        color: 'var(--ink)',
        fontSize: 13.5,
        lineHeight: 1.45,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" style={{ flex: 'none' }} aria-hidden="true">
        <path
          d="M8 1.5 L15 14 H1 Z M8 6 V10 M8 11.6 V12"
          fill="none"
          stroke="var(--bad)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span style={{ flex: 1 }}>
        <b style={{ fontWeight: 600 }}>Heads up:</b> this is a vibe-coded hobby project, <b style={{ fontWeight: 600 }}>not
        financial advice</b>. The numbers are illustrative — don't make real money decisions based on them. Talk to a
        licensed advisor.
      </span>
      <button
        type="button"
        aria-label="Dismiss disclaimer"
        onClick={dismiss}
        style={{
          flex: 'none',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ink-2)',
          fontSize: 18,
          lineHeight: 1,
          padding: 4,
        }}
      >
        ×
      </button>
    </div>
  )
}
