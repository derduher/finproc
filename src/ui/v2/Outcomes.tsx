/**
 * v2 outcome components — the reframed, two-sided read of a projection:
 * what you can sustain, what happens if markets disappoint (magnitude + timing),
 * and the surplus if they're kind. Presentational; all logic comes from
 * `deriveOutcomeReads` (src/sim/outcome.ts).
 */
import { formatMoneyAbbreviated as fmt } from '../../math'
import type { OutcomeReads } from '../../sim/outcome'
import { LegacyBar } from '../charts/LegacyBar'

/** Sustainable-spend hero — leads with what you can spend, not a success %. */
export function SustainableHero({ reads, size = 76 }: { reads: OutcomeReads; size?: number }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 8 }}>spending you can sustain</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span className="hero-spend" style={{ fontSize: size }}>{fmt(reads.sustainable)}</span>
        <span style={{ fontSize: 20, color: 'var(--ink-3)' }}>/ year</span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 8, maxWidth: 460, lineHeight: 1.5 }}>
        In today's dollars, with a <b style={{ fontWeight: 500, color: 'var(--ink)' }}>90% safety margin</b> — the spend level
        where nearly all futures keep money to age {reads.maxAge}.
      </div>
      {reads.isOverSaver ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 14px', background: 'var(--good-soft)', borderRadius: 8, maxWidth: 460 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ flex: 'none' }}><path d="M8 13 V3 M4 7 L8 3 L12 7" fill="none" stroke="var(--good)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            Your current target is <b className="num" style={{ color: 'var(--ink)' }}>{fmt(reads.target)}</b> — you're likely
            <b style={{ color: 'var(--good)', fontWeight: 600 }}> under-spending by ~{fmt(reads.underspendBy)}/yr</b>.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 14px', background: 'var(--bad-soft)', borderRadius: 8, maxWidth: 460 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ flex: 'none' }}><path d="M8 3 V13 M4 9 L8 13 L12 9" fill="none" stroke="var(--bad)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            Your target <b className="num" style={{ color: 'var(--ink)' }}>{fmt(reads.target)}</b> is
            <b style={{ color: 'var(--bad)', fontWeight: 600 }}> ~{fmt(reads.overspendBy)}/yr above</b> what's sustainable at 90% —
            consider trimming or working longer.
          </div>
        </div>
      )}
    </div>
  )
}

/** Plain-language downside: magnitude + timing, honest about which way the risk runs. */
export function RiskRead({ reads, compact = false }: { reads: OutcomeReads; compact?: boolean }) {
  const funded = reads.worstShortfallAge === undefined
  return (
    <div className="outcome down">
      <div className="edge" />
      <div className="label" style={{ color: 'var(--bad)', marginBottom: 8 }}>if markets disappoint</div>
      <div style={{ fontSize: compact ? 15 : 17, color: 'var(--ink)', lineHeight: 1.45, fontFamily: 'var(--font-display)' }}>
        {funded ? (
          <>Even the worst <span className="num">1 in 10</span> markets keep your {fmt(reads.target)} plan funded
            to age {reads.maxAge} — with about <b>{fmt(reads.legacyP10)}</b> still unspent.</>
        ) : (
          <>In the worst <span className="num">1 in 10</span> markets, your {fmt(reads.target)} plan runs short
            around <b>age {reads.worstShortfallAge}</b>.</>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.5 }}>
        {reads.rareShortfallAge !== undefined ? (
          <>Money doesn't run short until roughly the worst <b className="num" style={{ color: 'var(--ink)' }}>1 in 100</b> futures,
            and not before age {reads.rareShortfallAge}.</>
        ) : (
          <>Even the worst <b className="num" style={{ color: 'var(--ink)' }}>1 in 100</b> futures keep the plan funded.</>
        )}
        {funded && <> The real risk here is the opposite — <b style={{ color: 'var(--ink)' }}>under-living a plan that can afford more</b>.</>}
      </div>
    </div>
  )
}

/** The other side: surplus left unspent — a signal you could spend more / retire sooner. */
export function SurplusRead({ reads }: { reads: OutcomeReads }) {
  return (
    <div className="outcome up">
      <div className="edge" />
      <div className="label" style={{ color: 'var(--good)', marginBottom: 8 }}>if markets are kind</div>
      <div style={{ fontSize: 17, color: 'var(--ink)', lineHeight: 1.45, fontFamily: 'var(--font-display)' }}>
        Half of futures leave <b>{fmt(reads.legacyP50)}</b> unspent at age {reads.maxAge}.
      </div>
      <div style={{ marginTop: 12 }}>
        <LegacyBar width={300} p10={reads.legacyP10} p50={reads.legacyP50} p90={reads.legacyP90} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>
        Money left over is its own outcome — a signal you could <b style={{ color: 'var(--ink)' }}>spend more now</b> or retire sooner.
      </div>
    </div>
  )
}

/**
 * "How soon could you retire?" — the companion solve to the sustainable-spend
 * hero (#10). `age` is null while solving and undefined when even retiring at
 * maxAge can't sustain the target spend.
 */
export function EarliestRetireRead({
  age,
  planRetireAge,
  targetSpend,
  maxAge,
  loading,
}: {
  age: number | null | undefined
  planRetireAge: number
  targetSpend: number
  maxAge: number
  loading: boolean
}) {
  return (
    <div style={{ marginTop: 16, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 10, maxWidth: 460, background: 'var(--bg-elev)' }}>
      <div className="label" style={{ marginBottom: 6 }}>how soon could you retire?</div>
      {age === null ? (
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{loading ? 'solving for the earliest age…' : '—'}</div>
      ) : age === undefined ? (
        <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Even retiring at <b className="num" style={{ color: 'var(--ink)' }}>{maxAge}</b>, spending {fmt(targetSpend)}/yr isn't
          sustainable at 90%. Trim spending or save more.
        </div>
      ) : (
        <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Earliest at <b className="num" style={{ color: 'var(--ink)', fontSize: 15 }}>age {age}</b> while spending {fmt(targetSpend)}/yr —{' '}
          {age < planRetireAge ? (
            <b style={{ color: 'var(--good)' }}>{planRetireAge - age} year{planRetireAge - age === 1 ? '' : 's'} sooner than your plan</b>
          ) : age > planRetireAge ? (
            <b style={{ color: 'var(--bad)' }}>{age - planRetireAge} year{age - planRetireAge === 1 ? '' : 's'} later than your plan of {planRetireAge}</b>
          ) : (
            <>right at your planned age</>
          )}
          .
        </div>
      )}
    </div>
  )
}

/** Demoted secondary metric — the old hero, now a quiet chip. */
export function HoldChip({ reads }: { reads: OutcomeReads }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-3)' }}>
      <span className="num" style={{ fontSize: 15, color: 'var(--ink-2)' }}>{Math.round(reads.holdRate * 100)}%</span>
      of runs hold at your {fmt(reads.target)} target
    </div>
  )
}
