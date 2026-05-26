import type { MonteCarloYearlyResult } from '../../sim/montecarlo'

interface Props {
  data: MonteCarloYearlyResult[]
  retireAge: number
  ssAge?: number
  width?: number
  height?: number
}

export function HiCashflow({ data, retireAge, ssAge, width = 720, height = 200 }: Props) {
  if (!data.length) return null

  const pad = { l: 56, r: 24, t: 16, b: 36 }
  const cw = width - pad.l - pad.r
  const ch = height - pad.t - pad.b

  const N = data.length
  const bw = cw / N

  // Zero line at 55% from top (leaves more room above for contributions)
  const zeroY = pad.t + ch * 0.55

  // Scale: find max contribution+SS and max withdrawal for scaling
  const maxUp = Math.max(...data.map((d) => d.contributionsMedian + d.socialSecurityMedian), 1)
  const maxDown = Math.max(...data.map((d) => d.withdrawalsMedian), 1)

  const upH = ch * 0.55
  const downH = ch * 0.45

  const x = (i: number) => pad.l + i * bw

  const currentAge = data[0].age

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Zero line */}
      <line x1={pad.l} y1={zeroY} x2={pad.l + cw} y2={zeroY} stroke="var(--chart-axis)" strokeWidth="1" />

      {/* Bars per year */}
      {data.map((d, i) => {
        const xi = x(i) + 1
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

      {/* Retire marker */}
      {retireAge >= currentAge && retireAge <= data.at(-1)!.age && (
        <line
          data-marker="retire"
          x1={x(retireAge - currentAge)}
          y1={pad.t}
          x2={x(retireAge - currentAge)}
          y2={pad.t + ch}
          stroke="var(--ink-3)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      )}

      {/* Age axis labels */}
      {[currentAge, retireAge, ssAge, data.at(-1)!.age]
        .filter((a): a is number => a !== undefined && a >= currentAge && a <= data.at(-1)!.age)
        .filter((a, i, arr) => arr.indexOf(a) === i) // dedupe
        .map((a) => (
          <text
            key={a}
            x={x(a - currentAge)}
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
