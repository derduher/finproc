/**
 * RangeHero — the honest first-run hero. Until the three guesses are checked,
 * the sustainable-spend answer is shown as a RANGE rather than a single number:
 * the spread is not market risk but the three things we guessed about the user
 * (see `useGuessRange` / `sim/guesses.ts`). Confirming guesses narrows the band;
 * once all are checked, MainScreen swaps in the single-number `SustainableHero`.
 */
import { formatMoneyAbbreviated as fmt } from '../../math'

export function RangeHero({
  low,
  high,
  best,
  uncheckedCount,
}: {
  low: number | null
  high: number | null
  best: number | null
  uncheckedCount: number
}) {
  const solving = low == null || high == null || best == null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span className="label">spending you can sustain</span>
        <span className="defpill">rough · {uncheckedCount} guess{uncheckedCount === 1 ? '' : 'es'} unchecked</span>
      </div>
      {solving ? (
        <div className="hero-spend" style={{ fontSize: 62, color: 'var(--ink-3)' }}>…</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="hero-spend" style={{ fontSize: 62 }}>{fmt(low)}</span>
          <span className="hero-spend" style={{ fontSize: 44, color: 'var(--ink-3)' }}>–</span>
          <span className="hero-spend" style={{ fontSize: 62 }}>{fmt(high)}</span>
          <span style={{ fontSize: 19, color: 'var(--ink-3)' }}>/ year</span>
        </div>
      )}
      {!solving && (
        <div style={{ width: 360, marginTop: 16 }}>
          <div style={{ position: 'relative', height: 6, borderRadius: 4, background: 'var(--accent-soft)' }}>
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: 13, height: 13, borderRadius: 999, background: 'var(--bg-elev)', border: '1.5px solid var(--ink)', transform: 'translate(-50%, -50%)', boxShadow: 'var(--shadow-sm)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span className="micro">if our guesses run high</span>
            <span className="micro" style={{ color: 'var(--ink-2)' }}>best guess {fmt(best)}</span>
            <span className="micro">if they run low</span>
          </div>
        </div>
      )}
      <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 14, maxWidth: 470, lineHeight: 1.5 }}>
        In today's dollars, with a <b style={{ fontWeight: 500, color: 'var(--ink)' }}>90% safety margin</b>. The spread isn't
        market risk — it's <b style={{ fontWeight: 500, color: 'var(--ink)' }}>three things we guessed about you</b>. Check them below and this settles to one number.
      </div>
    </div>
  )
}
