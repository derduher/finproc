/**
 * PathStories — the "what happened, year by year" read. Picks a representative
 * middle path (end balance near P50) and a bad-luck path (near P10) and renders
 * the plain-language narrative for each, so a user can see *why* a path went the
 * way it did — sequence-of-returns risk, the worst year, guardrail cuts — not
 * just the balance line. Logic lives in `sim/pathNarrative`; this is presentation.
 */
import { buildPathNarrative, type PathNarrative } from '../../sim/pathNarrative'
import type { MonteCarloResult, SamplePath } from '../../sim/montecarlo'

/** Sampled path whose ending balance is closest to a target (P50 / P10). */
function pathClosestTo(paths: SamplePath[], target: number): SamplePath | undefined {
  let best: SamplePath | undefined
  let bestDiff = Infinity
  for (const p of paths) {
    const end = p.balances[p.balances.length - 1] ?? 0
    const diff = Math.abs(end - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = p
    }
  }
  return best
}

function Story({ title, tone, narrative }: { title: string; tone: 'neutral' | 'bad'; narrative: PathNarrative }) {
  const accent = tone === 'bad' ? 'var(--bad)' : 'var(--ink-3)'
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', background: 'var(--bg-elev)' }}>
      <div className="label" style={{ color: accent, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.45, fontFamily: 'var(--font-display)' }}>
        {narrative.summary}
      </div>
      {narrative.points.length > 0 && (
        <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {narrative.points.map((p, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, paddingLeft: 14, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: accent }}>·</span>
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PathStories({
  result,
  currentAge,
  retireAge,
}: {
  result: MonteCarloResult
  currentAge: number
  retireAge: number
}) {
  const median = pathClosestTo(result.samplePaths, result.p50EndBalance)
  const bad = pathClosestTo(result.samplePaths, result.p10EndBalance)
  // Need per-year rate detail to narrate; absent on legacy cached results.
  if (!median?.returns?.length || !bad?.returns?.length) return null

  const medianN = buildPathNarrative({ path: median, currentAge, retireAge })
  const badN = buildPathNarrative({ path: bad, currentAge, retireAge })

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
      <h2 style={{ margin: '0 0 4px' }}>What happened, year by year</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 14 }}>
        Two representative futures — a typical one and a bad-luck one — and what drove each.
      </div>
      <div className="v2-outcome-grid">
        <Story title="a typical path" tone="neutral" narrative={medianN} />
        <Story title="a bad-luck path · near the worst 1 in 10" tone="bad" narrative={badN} />
      </div>
    </div>
  )
}
