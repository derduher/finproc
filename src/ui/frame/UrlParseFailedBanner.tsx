/**
 * Banner shown when a shared URL had an `?s=` param but it failed to decode.
 * Sits at the top of the viewport, above the TopBar, until dismissed.
 */
interface Props {
  visible: boolean
  onDismiss: () => void
}

export function UrlParseFailedBanner({ visible, onDismiss }: Props) {
  if (!visible) return null
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: 'var(--bad-soft)',
        color: 'var(--bad)',
        borderBottom: '1px solid var(--bad)',
        fontSize: 13,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 4.5 V 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.8" fill="currentColor" />
      </svg>
      <div style={{ flex: 1 }}>
        Couldn&apos;t load the shared scenario — the URL appears to be corrupted or from an older
        version. Showing your defaults instead.
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        style={{
          background: 'transparent',
          color: 'inherit',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          padding: '0 4px',
        }}
      >
        ×
      </button>
    </div>
  )
}
