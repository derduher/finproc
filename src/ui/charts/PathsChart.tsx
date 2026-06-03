/**
 * PathsChart — the "one thousand possible futures" spaghetti chart.
 *
 * Methodology-aligned (docs/methodology-review.md P0 #1/#2): instead of a smooth
 * fan band that hides sequence-of-returns risk, it draws many individual
 * year-by-year run trajectories (`MonteCarloResult.samplePaths`). Depleting paths
 * are tinted, one bad-luck path is highlighted, the median is drawn on top, and
 * the very top is clipped to a percentile so a couple of lucky paths don't
 * manufacture a fat tail.
 *
 * Pure/presentational: it renders whatever `samplePaths` + `median` it's given
 * (already deflated to the active display mode by the caller).
 */
import { formatMoneyAbbreviated } from '../../math'
import type { SamplePath } from '../../sim/montecarlo'

export interface PathExpenseMarker {
  age: number
  amount: number
  label?: string
}

export interface PathsChartProps {
  /** Individual run trajectories (balance per year-end). */
  samplePaths: SamplePath[]
  /** Median balance per year-end, aligned to the same year indices. */
  median: number[]
  currentAge: number
  retireAge: number
  maxAge: number
  /** Optional starting total balance, prepended at `currentAge` so paths begin at today's savings. */
  startBalance?: number
  ssAge?: number
  /** One-time expenditure markers. */
  expenses?: PathExpenseMarker[]
  /** Legend caption override (e.g. "~99% of 1,000 runs hold your $80K target"). */
  holdLabel?: string
  width?: number
  height?: number
  /** Clip the y-axis at this percentile of all balances (default 0.94). */
  yCapPctl?: number
  inline?: boolean
  showAxes?: boolean
  showLegend?: boolean
  showRetire?: boolean
  showExpenses?: boolean
}

export function PathsChart({
  samplePaths,
  median,
  currentAge,
  retireAge,
  maxAge,
  startBalance,
  ssAge,
  expenses = [],
  holdLabel,
  width = 1000,
  height = 360,
  yCapPctl = 0.94,
  inline = false,
  showAxes = true,
  showLegend = true,
  showRetire = true,
  showExpenses = true,
}: PathsChartProps) {
  const pad = inline ? { l: 30, r: 12, t: 12, b: 22 } : { l: 58, r: 18, t: 16, b: 34 }
  const cw = width - pad.l - pad.r
  const ch = height - pad.t - pad.b

  const n = samplePaths[0]?.balances.length ?? 0
  const hasStart = startBalance != null
  // Age for each plotted point (optionally prepend the starting age).
  const ages: number[] = []
  if (hasStart) ages.push(currentAge)
  for (let i = 0; i < n; i++) ages.push(currentAge + 1 + i)
  const seriesOf = (balances: number[]): number[] =>
    hasStart ? [startBalance as number, ...balances] : balances

  const pathSeries = samplePaths.map((p) => seriesOf(p.balances))
  const medianSeries = seriesOf(median)

  // y cap = percentile of all plotted balances (keeps the chart honest).
  const allVals: number[] = []
  for (const s of pathSeries) for (const v of s) allVals.push(v)
  allVals.sort((a, b) => a - b)
  const lastMedian = medianSeries[medianSeries.length - 1] ?? 0
  const cap = Math.max(allVals[Math.floor(allVals.length * yCapPctl)] || 1, lastMedian * 1.2, 1)

  const span = Math.max(1, maxAge - currentAge)
  const x = (age: number) => pad.l + ((age - currentAge) / span) * cw
  const y = (v: number) => pad.t + ch - (Math.min(v, cap) / cap) * ch
  const linePath = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(ages[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')

  // Pick the "bad early sequence": earliest depletion, else lowest ending balance.
  let badIdx = 0
  let badScore = Infinity
  samplePaths.forEach((p, i) => {
    if (p.depleteAge !== undefined) {
      const sc = p.depleteAge - 1000 // strongly prefer earliest depletion
      if (sc < badScore) {
        badScore = sc
        badIdx = i
      }
    }
  })
  if (!isFinite(badScore)) {
    samplePaths.forEach((p, i) => {
      const v = p.balances[p.balances.length - 1] ?? 0
      if (v < badScore) {
        badScore = v
        badIdx = i
      }
    })
  }

  const depleteCount = samplePaths.filter((p) => p.depleteAge !== undefined).length
  const yTicks = [0, cap * 0.5, cap]
  const badPath = samplePaths[badIdx]
  const ageTicks = [currentAge, retireAge, ssAge, maxAge].filter(
    (a): a is number => a != null,
  )

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Projected portfolio paths">
      {/* gridlines */}
      {showAxes &&
        yTicks.map((v, i) => (
          <line key={`g${i}`} x1={pad.l} y1={y(v)} x2={pad.l + cw} y2={y(v)} stroke="var(--chart-grid)" strokeWidth="1" />
        ))}

      {/* retirement shading */}
      {showRetire && (
        <rect x={x(retireAge)} y={pad.t} width={pad.l + cw - x(retireAge)} height={ch} fill="var(--bg-sunk)" opacity="0.5" />
      )}

      {/* individual paths (bad path drawn last, on top) */}
      {pathSeries.map((s, i) => {
        if (i === badIdx) return null
        const dep = samplePaths[i].depleteAge !== undefined
        return (
          <path
            key={`p${i}`}
            d={linePath(s)}
            fill="none"
            stroke={dep ? 'var(--bad)' : 'var(--ink)'}
            strokeWidth={dep ? 1.1 : 1}
            opacity={dep ? 0.16 : 0.1}
            strokeLinejoin="round"
          />
        )
      })}

      {/* median path */}
      <path d={linePath(medianSeries)} fill="none" stroke="var(--chart-line)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

      {/* highlighted bad-luck path */}
      {badPath && (
        <path d={linePath(pathSeries[badIdx])} fill="none" stroke="var(--bad)" strokeWidth="2" strokeLinejoin="round" />
      )}
      {badPath?.depleteAge !== undefined && (
        <g>
          <circle cx={x(badPath.depleteAge)} cy={y(0)} r="3.5" fill="var(--bad)" />
          {!inline && (
            <text x={x(badPath.depleteAge)} y={y(0) - 8} fontFamily="var(--font-body)" fontSize="11" fill="var(--bad)" textAnchor="middle">
              runs short · {badPath.depleteAge}
            </text>
          )}
        </g>
      )}

      {/* retire marker */}
      {showRetire && (
        <g>
          <line x1={x(retireAge)} y1={pad.t} x2={x(retireAge)} y2={pad.t + ch} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 4" />
          {!inline && (
            <text x={x(retireAge) + 6} y={pad.t + 12} fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)">
              retire · {retireAge}
            </text>
          )}
        </g>
      )}

      {/* one-time expenditure markers */}
      {showExpenses &&
        expenses.map((e, i) => (
          <g key={`exp${i}`}>
            <line x1={x(e.age)} y1={pad.t + ch} x2={x(e.age)} y2={pad.t + ch - 14} stroke="var(--accent)" strokeWidth="1.5" />
            <circle cx={x(e.age)} cy={pad.t + ch - 16} r="3" fill="var(--accent)" />
            {!inline && (
              <text x={x(e.age)} y={pad.t + ch - 22} fontFamily="var(--font-body)" fontSize="10" fill="var(--accent-ink)" textAnchor="middle">
                {formatMoneyAbbreviated(e.amount)}
              </text>
            )}
          </g>
        ))}

      {/* axes */}
      {showAxes && (
        <>
          <line x1={pad.l} y1={pad.t + ch} x2={pad.l + cw} y2={pad.t + ch} stroke="var(--chart-axis)" strokeWidth="1" />
          {yTicks.map((v, i) => (
            <text key={`yt${i}`} x={pad.l - 8} y={y(v) + 3} fontFamily="var(--font-mono)" fontSize="11" fill="var(--ink-3)" textAnchor="end">
              {formatMoneyAbbreviated(v)}
              {i === yTicks.length - 1 ? '+' : ''}
            </text>
          ))}
          {ageTicks.map((a, i) => (
            <text key={`xt${i}`} x={x(a)} y={pad.t + ch + 16} fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)" textAnchor="middle">
              {a}
            </text>
          ))}
        </>
      )}

      {/* legend */}
      {showLegend && !inline && (
        <g transform={`translate(${pad.l + 8}, ${pad.t + 4})`}>
          <line x1="0" y1="5" x2="18" y2="5" stroke="var(--chart-line)" strokeWidth="2.4" />
          <text x="24" y="9" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-2)">median path</text>
          <line x1="118" y1="5" x2="136" y2="5" stroke="var(--bad)" strokeWidth="2" />
          <text x="142" y="9" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-2)">a bad-luck path</text>
          <text x="250" y="9" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)">
            {holdLabel ||
              `${samplePaths.length} of runs shown · ${depleteCount > 0 ? `${Math.round((depleteCount / samplePaths.length) * 100)}% run short` : 'all hold'}`}
          </text>
        </g>
      )}
    </svg>
  )
}
