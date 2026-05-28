import type { MonteCarloYearlyResult } from '../../sim/montecarlo'

interface Props {
  data: MonteCarloYearlyResult[]
  /** The plan's current age. Each data row is a year-END state, so ages run currentAge+1..maxAge. */
  currentAge: number
  retireAge: number
  ssAge?: number
  width?: number
  height?: number
}

export function HiCashflow({ data, currentAge, retireAge, ssAge, width = 720, height = 200 }: Props) {
  if (!data.length) return null

  const pad = { l: 56, r: 24, t: 16, b: 36 }
  const cw = width - pad.l - pad.r
  const ch = height - pad.t - pad.b

  const maxAge = data.at(-1)!.age
  // Total span in years. Each bar occupies one year-slot; the bar for a row of
  // age `a` represents the year [a-1, a] and is drawn in that slot.
  const span = Math.max(1, maxAge - currentAge)
  const bw = cw / span

  // Zero line at 55% from top (leaves more room above for contributions)
  const zeroY = pad.t + ch * 0.55

  // Scale: find max contribution+SS and max withdrawal for scaling
  const maxUp = Math.max(...data.map((d) => d.contributionsMedian + d.socialSecurityMedian), 1)
  const maxDown = Math.max(...data.map((d) => d.withdrawalsMedian), 1)

  const upH = ch * 0.55
  const downH = ch * 0.45

  // x position of an age boundary (tick): the left edge of the year that ends at `age`.
  const xAt = (age: number) => pad.l + (age - currentAge) * bw

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Zero line */}
      <line x1={pad.l} y1={zeroY} x2={pad.l + cw} y2={zeroY} stroke="var(--chart-axis)" strokeWidth="1" />

      {/* Bars per year. Bar for age `a` occupies the slot [a-1, a]. */}
      {data.map((d) => {
        // Left edge of the year-ending-at-d.age slot, with a 1px inset gap.
        const xi = xAt(d.age - 1) + 1
        const w = Math.max(1, bw - 2)

        const contribH = (d.contributionsMedian / maxUp) * upH
        const ssH = (d.socialSecurityMedian / maxUp) * upH
        const wdH = (d.withdrawalsMedian / maxDown) * downH

        return (
          <g key={d.age} data-age={d.age}>
            {/* Contribution bar (above zero) */}
            {d.contributionsMedian > 0 && (
              <rect
                data-bar="contribution"
                x={xi}
                y={zeroY - contribH}
                width={w}
                height={contribH}
                fill="var(--ink)"
                opacity="0.85"
              />
            )}
            {/* SS bar stacked on top of contributions */}
            {d.socialSecurityMedian > 0 && (
              <rect
                data-bar="ss"
                x={xi}
                y={zeroY - contribH - ssH}
                width={w}
                height={ssH}
                fill="var(--accent)"
              />
            )}
            {/* Withdrawal bar (below zero, outlined) */}
            {d.withdrawalsMedian > 0 && (
              <rect
                data-bar="withdrawal"
                x={xi}
                y={zeroY}
                width={w}
                height={wdH}
                fill="var(--bg-elev)"
                stroke="var(--ink)"
                strokeWidth="0.8"
              />
            )}
          </g>
        )
      })}

      {/* Retire marker — sits at the age boundary, i.e. the right edge of the
          last contributing year and the left edge of the first withdrawal year. */}
      {retireAge >= currentAge && retireAge <= maxAge && (
        <line
          data-marker="retire"
          x1={xAt(retireAge)}
          y1={pad.t}
          x2={xAt(retireAge)}
          y2={pad.t + ch}
          stroke="var(--ink-3)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      )}

      {/* Age axis labels (boundary ticks) */}
      {[currentAge, retireAge, ssAge, maxAge]
        .filter((a): a is number => a !== undefined && a >= currentAge && a <= maxAge)
        .filter((a, i, arr) => arr.indexOf(a) === i) // dedupe
        .map((a) => (
          <text
            key={a}
            x={xAt(a)}
            y={pad.t + ch + 16}
            fontFamily="var(--font-body)"
            fontSize="11"
            fill="var(--ink-3)"
            textAnchor="middle"
          >
            {a}
          </text>
        ))}

      {/* Legend */}
      <g transform={`translate(${pad.l + 8}, ${pad.t + 6})`}>
        <rect x="0" y="0" width="10" height="10" fill="var(--ink)" opacity="0.85" />
        <text x="14" y="9" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-2)">
          contributions
        </text>
        <rect x="106" y="0" width="10" height="10" fill="var(--accent)" />
        <text x="120" y="9" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-2)">
          Soc. Sec.
        </text>
        <rect
          x="184"
          y="0"
          width="10"
          height="10"
          fill="var(--bg-elev)"
          stroke="var(--ink)"
          strokeWidth="1"
        />
        <text x="198" y="9" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-2)">
          withdrawals
        </text>
      </g>
    </svg>
  )
}
