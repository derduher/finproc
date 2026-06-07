/**
 * StressTest — "how does this plan hold up against real history?"
 *
 * Two reads, deliberately separate from the probabilistic chart above:
 *  - A cohort headline: the fraction of historical retirement start years the
 *    plan survived, with the failing years named (more visceral than a %).
 *  - Named-crisis cards: pass/fail, the trough, and the depletion age for each
 *    recognizable crisis, anchored at retirement. Clicking a card overlays that
 *    crisis on the futures chart above.
 *
 * Presentational: all numbers come from `useHistoricalStress`.
 */
import { formatMoneyAbbreviated as fmt } from '../../math'
import type { HistoricalStress } from '../../hooks/useHistoricalStress'
import type { StressScenarioView } from '../../sim/stressView'

/** Collapse a sorted year list into compact ranges: [1965,1966,1967,1970] → "1965–1967, 1970". */
function formatYearRanges(years: number[]): string {
  if (years.length === 0) return ''
  const sorted = [...years].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  const flush = () => parts.push(start === prev ? `${start}` : `${start}–${prev}`)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) prev = sorted[i]
    else {
      flush()
      start = prev = sorted[i]
    }
  }
  flush()
  return parts.join(', ')
}

function CohortHeadline({ stress }: { stress: HistoricalStress }) {
  const { cohort } = stress
  if (cohort.total === 0) {
    return (
      <div style={{ fontSize: 15, color: 'var(--ink-2)' }}>
        Not enough market history to backtest this horizon.
      </div>
    )
  }
  const pct = Math.round(cohort.survivalRate * 100)
  const allHeld = cohort.failedYears.length === 0
  return (
    <div>
      <div style={{ fontSize: 19, fontFamily: 'var(--font-display)', color: 'var(--ink)', lineHeight: 1.4 }}>
        Your plan survived{' '}
        <span style={{ color: allHeld ? 'var(--good)' : pct >= 80 ? 'var(--ink)' : 'var(--bad)' }}>
          {cohort.survived} of {cohort.total}
        </span>{' '}
        historical retirement start years <span style={{ color: 'var(--ink-3)' }}>({pct}%)</span>.
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>
        {allHeld
          ? 'Every retirement that started in the 1928–2023 record would have lasted your full horizon.'
          : `It would have run short only if you'd retired in ${formatYearRanges(cohort.failedYears)}.`}
      </div>
    </div>
  )
}

function CrisisCard({
  view,
  selected,
  onSelect,
}: {
  view: StressScenarioView
  selected: boolean
  onSelect: () => void
}) {
  const { scenario, survived } = view
  const tone = survived ? 'var(--good)' : 'var(--bad)'
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        textAlign: 'left',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--line)'}`,
        boxShadow: selected ? '0 0 0 1px var(--accent)' : 'none',
        borderRadius: 10,
        padding: '14px 16px',
        background: 'var(--bg-elev)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 15, fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{scenario.name}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: tone,
            background: survived ? 'var(--good-soft)' : 'var(--bad-soft)',
            borderRadius: 999,
            padding: '2px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {survived ? 'held' : `ran short · ${view.depleteAge}`}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>{scenario.blurb}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>
        {survived ? (
          <>dipped to {fmt(view.troughBalance)} at {view.troughAge} · ended {fmt(view.endBalance)}</>
        ) : (
          <>portfolio exhausted at age {view.depleteAge}</>
        )}
      </div>
      <div style={{ fontSize: 11, color: selected ? 'var(--accent)' : 'var(--ink-3)' }}>
        {selected ? 'shown on chart ✓' : 'show on chart'}
      </div>
    </button>
  )
}

export function StressTest({
  stress,
  selectedId,
  onSelect,
}: {
  stress: HistoricalStress
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
      <h2 style={{ margin: '0 0 4px' }}>How it holds up against history</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 14, maxWidth: 720 }}>
        Instead of random markets, this replays the actual record — each crisis anchored at your
        retirement age, where a bad start does the most damage. Illustrative, not a forecast; past
        worst cases aren't a guaranteed floor.
      </div>

      <div style={{ marginBottom: 16 }}>
        <CohortHeadline stress={stress} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
        }}
      >
        {stress.scenarios.map((v) => (
          <CrisisCard
            key={v.scenario.id}
            view={v}
            selected={selectedId === v.scenario.id}
            onSelect={() => onSelect(selectedId === v.scenario.id ? null : v.scenario.id)}
          />
        ))}
      </div>
    </div>
  )
}
