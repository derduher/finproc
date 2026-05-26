export type StageState = 'done' | 'active' | 'pending'

interface Props {
  state: StageState
  label: string
  eta: string
}

function StageSpinner() {
  return (
    <svg
      data-stage-icon="active"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      style={{ animation: 'spin 0.9s linear infinite', transformOrigin: 'center' }}
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5" fill="none" stroke="var(--line-strong)" strokeWidth="1.4" opacity="0.3" />
      <path d="M7 2 A 5 5 0 0 1 12 7" stroke="var(--accent)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function Stage({ state, label, eta }: Props) {
  const icon =
    state === 'done' ? (
      <svg data-stage-icon="done" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="6" fill="var(--good)" />
        <path d="M4 7 L 6 9 L 10 5" fill="none" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ) : state === 'active' ? (
      <StageSpinner />
    ) : (
      <svg data-stage-icon="pending" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="6" fill="none" stroke="var(--line-strong)" strokeWidth="1.2" />
      </svg>
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <span
          data-stage-label={state}
          style={{ fontSize: 13, color: state === 'pending' ? 'var(--ink-3)' : 'var(--ink)' }}
        >
          {label}
        </span>
      </div>
      <div className="num" style={{ fontSize: 11, color: 'var(--ink-3)', paddingLeft: 22 }}>
        {eta}
      </div>
    </div>
  )
}
