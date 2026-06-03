/**
 * MethodologyDrawer — the deeper "how we model this" panel. Every simplification
 * surfaced with the direction it bends the result (methodology cross-cutting
 * transparency principle). Presentational.
 */
import type { Bias } from './Assumptions'

function MethItem({ bias, title, body }: { bias: Bias; title: string; body: string }) {
  const glyph = bias === 'opt' ? '↑' : bias === 'cons' ? '↓' : '⇄'
  const word = bias === 'opt' ? 'leans optimistic' : bias === 'cons' ? 'leans conservative' : 'cuts both ways'
  return (
    <div className="meth-item">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className={'bias ' + bias} style={{ width: 18, height: 18, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{glyph}</span>
        <span style={{ fontSize: 14.5, color: 'var(--ink)', fontWeight: 500 }}>{title}</span>
        <span className="micro" style={{ marginLeft: 'auto' }}>{word}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{body}</div>
    </div>
  )
}

export function MethodologyDrawer({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" style={{ width: 520 }}>
        <div className="drawer-head">
          <div>
            <div className="label" style={{ marginBottom: 4 }}>transparency</div>
            <h2 style={{ fontSize: 20, margin: 0 }}>How we model this</h2>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4, maxWidth: 380 }}>
              Every simplification, shown with the direction it bends your result. Where we're optimistic, we say so.
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" aria-label="Close methodology" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body">
          <MethItem bias="two" title="Returns vary year to year" body="We draw a fresh return for every year, so the order of good and bad years matters — a crash early in retirement hurts far more than the same crash late. This is sequence-of-returns risk, the single biggest retirement risk." />
          <MethItem bias="opt" title="Returns use the historical average" body="Long-run history is generous relative to today's high valuations. Treat the median path as a hopeful-but-plausible middle, not a promise." />
          <MethItem bias="cons" title="Taxes use a flat marginal rate" body="A single rate on traditional withdrawals, with no standard-deduction or bracket-filling, tends to overstate the tax you'll actually pay in retirement — making plans look slightly worse than reality." />
          <MethItem bias="two" title="The plan ends at a fixed age" body="We stop at 95 by default. Plan to 100 and sustainable spending drops; plan to 90 and it rises. Longevity is a genuine unknown — try both." />
          <MethItem bias="two" title="We show magnitude and timing, not pass/fail" body="Instead of a single 'success rate', we show how much you'd need to adjust and roughly when. A plan that needs a small mid-course correction is very different from one that fails early." />
          <MethItem bias="cons" title="Guardrails turn ruin into a pay cut" body="With guardrails on, spending flexes down ~10% after bad stretches and up after good ones. That lets you start higher and converts most 'failures' into a few leaner years rather than running out." />
          <div className="micro" style={{ color: 'var(--ink-3)', paddingTop: 14, lineHeight: 1.5 }}>
            We'd rather be honest about uncertainty than show a falsely precise number.
          </div>
        </div>

        <div className="drawer-foot">
          <span className="micro">v2 methodology · updated 2026</span>
        </div>
      </div>
    </>
  )
}
