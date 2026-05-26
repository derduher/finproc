import type { InsightTone } from '../../sim/insights'

interface Props {
  tone: InsightTone
  title: string
  body: string
  cta: string
  onCtaClick?: () => void
}

export function InsightCard({ tone, title, body, cta, onCtaClick }: Props) {
  const stripeColor =
    tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--bad)' : 'var(--accent)'

  const iconBg =
    tone === 'good' ? 'var(--good-soft)' : tone === 'warn' ? 'var(--bad-soft)' : 'var(--accent-soft)'

  const iconColor =
    tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--bad)' : 'var(--accent-ink)'

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top accent stripe */}
      <div
        data-stripe={tone}
        style={{ height: 4, background: stripeColor, opacity: 0.85 }}
      />

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {/* Icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: iconColor,
              flexShrink: 0,
            }}
          >
            {tone === 'good' ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 6 L 5 9 L 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : tone === 'warn' ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M6 1.5 L 11 10 L 1 10 Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M6 5 V 7.5 M 6 8.6 V 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 6 L 10 6 M 6.5 2.5 L 10 6 L 6.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
        </div>

        {/* Body */}
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45, flex: 1 }}>{body}</div>

        {/* CTA */}
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          style={{ alignSelf: 'flex-start', marginLeft: -10, marginTop: 4 }}
          onClick={onCtaClick}
        >
          {cta} →
        </button>
      </div>
    </div>
  )
}
