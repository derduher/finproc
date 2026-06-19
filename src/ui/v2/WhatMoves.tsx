/**
 * WhatMoves — "what moves my plan": the OAT ±20% sensitivity tornado plus the
 * rule-based insight cards, ported from the v1 results step. Purely
 * presentational; MainScreen feeds it from useSensitivity / useInsights.
 */
import type { ReactNode } from 'react'
import { HiTornado } from '../charts/HiTornado'
import { tornadoNarrative } from './tornadoNarrative'
import type { SensitivityResult } from '../../schema'
import type { Insight, InsightTone } from '../../sim/insights'

const STRIPE: Record<InsightTone, string> = {
  good: 'var(--good)',
  warn: 'var(--bad)',
  accent: 'var(--accent)',
}

/** A swatch + label pair, colour-matched to the tornado's bars. */
function KeyItem({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flex: '0 0 auto' }} />
      {children}
    </span>
  )
}

/**
 * Static how-to-read key for the tornado, matched to how HiTornado actually
 * encodes its bars: a bar's *colour* is the success delta's sign (green raises
 * success, red lowers it) and its *side* is the nudge direction (lower-left,
 * higher-right) — NOT the side meaning "higher/lower success". Length = impact.
 */
function TornadoKey() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
      <KeyItem color="var(--good)">Green raises your success rate</KeyItem>
      <KeyItem color="var(--bad)">Red lowers it</KeyItem>
      <span>Each row&rsquo;s two bars show nudging that lever down (left) vs up (right) · longer bar = bigger impact · <strong style={{ fontWeight: 500 }}>pp</strong> = percentage points · top row = biggest lever</span>
    </div>
  )
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
  const hasTornado = sensitivity && sensitivity.length > 0
  const hasData = hasTornado || (insights && insights.length > 0)
  if (!hasData && !loading) return null

  const narrative = hasTornado ? tornadoNarrative(sensitivity) : null

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 22 }}>
      <h2 style={{ margin: 0 }}>What moves my plan</h2>
      {narrative && (
        <div style={{ fontSize: 14, color: 'var(--ink)', marginTop: 6 }}>{narrative.lead}</div>
      )}
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
        Each lever nudged ±20% (retirement age ±2 years), same simulated futures — so the bars
        compare like with like.
      </div>
      {hasTornado && <TornadoKey />}
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
