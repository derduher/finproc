/**
 * WhatMoves — "what moves my plan": the OAT ±20% sensitivity tornado plus the
 * rule-based insight cards, ported from the v1 results step. Purely
 * presentational; MainScreen feeds it from useSensitivity / useInsights.
 */
import { HiTornado } from '../charts/HiTornado'
import type { SensitivityResult } from '../../schema'
import type { Insight, InsightTone } from '../../sim/insights'

const STRIPE: Record<InsightTone, string> = {
  good: 'var(--good)',
  warn: 'var(--bad)',
  accent: 'var(--accent)',
}

function Card({ insight }: { insight: Insight }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', flex: '1 1 240px', maxWidth: 360 }}>
      <div data-stripe={insight.tone} style={{ height: 4, background: STRIPE[insight.tone], opacity: 0.85 }} />
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{insight.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{insight.body}</div>
      </div>
    </div>
  )
}

export function WhatMoves({
  sensitivity,
  insights,
  loading,
}: {
  sensitivity: SensitivityResult[] | null
  insights: Insight[] | null
  loading: boolean
}) {
  const hasData = (sensitivity && sensitivity.length > 0) || (insights && insights.length > 0)
  if (!hasData && !loading) return null

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 22 }}>
      <h2 style={{ margin: 0 }}>What moves my plan</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
        Each lever nudged ±20% (retirement age ±2 years), same simulated futures — so the bars
        compare like with like.
      </div>
      {!hasData ? (
        <div className="micro" style={{ padding: '28px 0', color: 'var(--ink-3)' }}>
          measuring which levers matter…
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {sensitivity && sensitivity.length > 0 && (
            <div style={{ flex: '0 1 480px', opacity: loading ? 0.6 : 1 }}>
              <HiTornado data={sensitivity} width={480} />
            </div>
          )}
          {insights && insights.length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: '1 1 300px' }}>
              {insights.map((i) => (
                <Card key={i.title} insight={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
