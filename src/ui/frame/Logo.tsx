export function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* SVG circle + wave + accent dot */}
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="13" fill="var(--bg-elev)" stroke="var(--line)" />
        <path
          d="M5 17 C8 10, 11 18, 14 13 C17 8, 20 16, 23 11"
          stroke="var(--accent)"
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="23" cy="11" r="2.5" fill="var(--accent)" />
      </svg>
      <div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 500,
          color: 'var(--ink)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>
          Threadwell
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 1 }}>
          retirement plot
        </div>
      </div>
    </div>
  )
}
