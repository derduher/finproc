/**
 * PreviewRail — 296px right-side rail on input steps. Shows a live preview of
 * the Monte Carlo simulation (success%, mini fan, median/P10) that updates as
 * the user edits inputs in the form on the left.
 *
 * Hidden on the Results step (where the full dashboard takes its place).
 */
import { useStore } from '../../store'
import { useSimulation } from '../../hooks/useSimulation'
import { HiFanChart } from '../charts/HiFanChart'
import { formatMoneyAbbreviated } from '../../math'
import { deflateResult } from '../../sim/displayMode'

export function PreviewRail() {
  const inputs = useStore((s) => s.inputs)
  const displayMode = useStore((s) => s.ui.displayMode)
  const { result: rawResult, stale } = useSimulation(inputs)
  // Apply nominal/real deflation so the mini-fan + metrics match the top-bar toggle.
  const result = rawResult ? deflateResult(rawResult, displayMode, inputs) : null

  const successPct = result && Number.isFinite(result.successRate)
    ? Math.round(result.successRate * 100)
    : null
  const depleted = result?.medianDepleteAge !== undefined

  return (
    <aside
      aria-label="Live simulation preview"
      className="shell-desktop-only"
      style={{
        // display owned by .shell-desktop-only (see styles.css).
        width: 296,
        padding: '20px 18px',
        borderLeft: '1px solid var(--line)',
        background: 'var(--bg)',
        flexDirection: 'column',
        gap: 14,
        flexShrink: 0,
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="label">live preview</div>
        <div
          className="badge"
          style={{
            background: stale ? 'var(--bad-soft)' : 'var(--good-soft)',
            color: stale ? 'var(--bad)' : 'var(--good)',
            borderColor: 'transparent',
          }}
        >
          {stale ? 'recomputing' : 'fresh'}
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="label" style={{ marginBottom: 4 }}>success rate</div>
        {result && successPct !== null ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div
                className="display"
                style={{
                  fontSize: 44,
                  color: depleted ? 'var(--bad)' : successPct >= 80 ? 'var(--good)' : successPct >= 50 ? 'var(--accent)' : 'var(--bad)',
                }}
              >
                {successPct}
                <span style={{ fontSize: 22, color: 'var(--ink-3)' }}>%</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                of 1,000<br />MC runs
              </div>
            </div>

            <div style={{ marginTop: 10, marginBottom: 6 }}>
              <HiFanChart result={result} width={260} height={120} retireAge={inputs.person.currentAge} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                paddingTop: 6,
                borderTop: '1px solid var(--line)',
              }}
            >
              <div className="metric">
                <div className="label">median</div>
                <div className="value-mono num" style={{ fontSize: 18 }}>
                  {formatMoneyAbbreviated(result.p50EndBalance)}
                </div>
              </div>
              <div className="metric">
                <div className="label">p10</div>
                <div className="value-mono num" style={{ fontSize: 18 }}>
                  {formatMoneyAbbreviated(result.p10EndBalance)}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="muted" style={{ fontSize: 13, padding: '24px 0' }}>
            running simulation…
          </div>
        )}
      </div>

      <div className="micro" style={{ lineHeight: 1.4 }}>
        Edits recompute on blur. Cache key includes seed; toggling real/nominal is free.
      </div>
    </aside>
  )
}
