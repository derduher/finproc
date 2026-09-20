/**
 * FundingRead — the "what you need vs what you'll have" section of the live
 * screen. Owns the section chrome (heading, progress, caption) around
 * `FundingChart`; the curve itself is solved by `useFundingCurve`.
 *
 * Pinned to today's dollars on purpose — see `FundingChart` for why there's no
 * nominal toggle here.
 */
import { FundingChart } from '../charts/FundingChart'
import { fundingCaption } from './fundingNarrative'
import type { FundingCurveResult, FundingProgress } from '../../sim/fundingCurve'

export interface FundingReadProps {
  curve: FundingCurveResult | null
  confidence: number
  /** The solver's confidence-matched earliest retirement age. */
  earliestAge?: number
  loading: boolean
  stale: boolean
  progress?: FundingProgress
  /** The plan's retirement age, for the no-crossing gap read. */
  planRetirementAge: number
  width: number
}

export function FundingRead({
  curve,
  confidence,
  earliestAge,
  loading,
  stale,
  progress,
  planRetirementAge,
  width,
}: FundingReadProps) {
  const pct = Math.round(confidence * 100)
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 22, marginBottom: 18 }}>
      <div className="v2-chart-head">
        <div>
          <h2 style={{ margin: 0 }}>What you need vs what you'll have</h2>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
            The falling line is what it takes to retire at each age and fund your spending at {pct}%
            confidence. The rising line is what you're projected to have if you keep working until then.
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            border: '1px solid var(--line)',
            borderRadius: 6,
            padding: '3px 8px',
            whiteSpace: 'nowrap',
            alignSelf: 'flex-start',
          }}
        >
          today's dollars
        </div>
      </div>

      {!curve ? (
        <div
          style={{ padding: '80px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}
          role="status"
        >
          {loading
            ? progress
              ? `Working out what each age costs… ${progress.done} of ${progress.total}`
              : 'Working out what each age costs…'
            : 'Add a plan to see your funding curve.'}
        </div>
      ) : (
        <div style={{ opacity: stale ? 0.55 : 1, transition: 'opacity 140ms' }}>
          <FundingChart
            result={curve}
            confidence={confidence}
            earliestAge={earliestAge}
            width={width}
            height={380}
          />
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.6 }}>
            {fundingCaption({ curve, confidence, earliestAge, planRetirementAge })}
          </div>
        </div>
      )}
    </div>
  )
}
