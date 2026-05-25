export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      style={{ animation: 'spin 0.9s linear infinite' }}
    >
      <circle cx="12" cy="12" r="10" fill="none"
        stroke="var(--line-strong)" strokeWidth="2" />
      <path d="M 12 2 A 10 10 0 0 1 22 12"
        fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function LoadingState() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 48,
      color: 'var(--ink-3)',
    }}>
      <Spinner size={36} />
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-2)' }}>Running 1,000 simulations…</div>
      <div className="micro">Monte Carlo · seeded · deterministic</div>

      {/* Skeleton tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, width: '100%', maxWidth: 560, marginTop: 8 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div className="skel" style={{ height: 8, width: '60%', marginBottom: 8 }} />
            <div className="skel" style={{ height: 28, width: '80%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Overlay shown on existing results while a recompute is in flight. */
export function StaleBadge() {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 8px',
      borderRadius: 99,
      background: 'var(--accent-soft)',
      color: 'var(--accent-ink)',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
    }}>
      <Spinner size={10} />
      UPDATING
    </div>
  )
}
