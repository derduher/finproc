import { formatMoneyAbbreviated } from '../../math'
import type { MonteCarloResult } from '../../sim/montecarlo'

interface Props {
  result: MonteCarloResult
  width?: number
  height?: number
  retireAge?: number
  /** When true, renders a depletion marker at depleteAge on the x-axis */
  depleted?: boolean
  depleteAge?: number
  /** Compact variant for sidebars — hides labels, tighter padding */
  inline?: boolean
}

const PAD = { top: 16, right: 48, bottom: 32, left: 56 }

export function HiFanChart({ result, width = 560, height = 280, retireAge, depleted = false, depleteAge, inline = false }: Props) {
  const { yearlyResults } = result
  if (!yearlyResults.length) return null

  const W = width - PAD.left - PAD.right
  const H = height - PAD.top - PAD.bottom

  const maxVal = Math.max(...yearlyResults.map((r) => r.p90))
  const minAge = yearlyResults[0].age - 1
  const maxAge = yearlyResults.at(-1)!.age

  const xScale = (age: number) => ((age - minAge) / (maxAge - minAge)) * W
  const yScale = (v: number) => H - (v / maxVal) * H

  // Build SVG paths
  const p50points = yearlyResults.map((r) => `${xScale(r.age)},${yScale(r.p50)}`).join(' ')
  const p90points = yearlyResults.map((r) => `${xScale(r.age)},${yScale(r.p90)}`).join(' ')
  const p10points = yearlyResults.map((r) => `${xScale(r.age)},${yScale(r.p10)}`).join(' ')

  // Band fill path: p90 forward, p10 backward
  const bandPath =
    `M ${yearlyResults.map((r) => `${xScale(r.age)},${yScale(r.p90)}`).join(' L ')} ` +
    `L ${[...yearlyResults].reverse().map((r) => `${xScale(r.age)},${yScale(r.p10)}`).join(' L ')} Z`

  // Y-axis ticks
  const numTicks = 5
  const yTicks = Array.from({ length: numTicks }, (_, i) => (maxVal / (numTicks - 1)) * i)

  return (
    <svg width={width} height={height} style={{ fontFamily: 'var(--font-mono)', overflow: 'visible' }}>
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {/* Grid lines */}
        {yTicks.map((v) => (
          <line key={v}
            x1={0} y1={yScale(v)} x2={W} y2={yScale(v)}
            stroke="var(--chart-grid)" strokeWidth={1} />
        ))}

        {/* Band fill */}
        <path d={bandPath} fill="var(--chart-band)" />

        {/* P90 dashed border */}
        <polyline points={p90points} fill="none" stroke="var(--accent-soft)" strokeWidth={1} strokeDasharray="4 3" />

        {/* P10 dashed border */}
        <polyline points={p10points} fill="none" stroke="var(--accent-soft)" strokeWidth={1} strokeDasharray="4 3" />

        {/* P50 solid line */}
        <polyline points={p50points} fill="none" stroke="var(--chart-line)" strokeWidth={2} />

        {/* Retire age marker */}
        {retireAge && retireAge >= minAge && retireAge <= maxAge && (
          <g transform={`translate(${xScale(retireAge)},0)`}>
            <line y1={0} y2={H} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 4" />
            {!inline && (
              <text x={6} y={12} fill="var(--ink-3)" fontSize={11} fontFamily="var(--font-body)">
                retire · age {retireAge}
              </text>
            )}
          </g>
        )}

        {/* Depletion marker */}
        {depleted && depleteAge !== undefined && depleteAge >= minAge && depleteAge <= maxAge && (
          <g transform={`translate(${xScale(depleteAge)},0)`}>
            <line y1={yScale(0) - 12} y2={yScale(0)} stroke="var(--bad)" strokeWidth={1.4} />
            <circle cx={0} cy={yScale(0)} r={4} fill="var(--bad)" />
            <text x={8} y={yScale(0) - 6} fill="var(--bad)" fontSize={11} fontFamily="var(--font-body)">
              P10 depleted · age {depleteAge}
            </text>
          </g>
        )}

        {/* X-axis */}
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--chart-axis)" />
        {yearlyResults.filter((_, i) => i % Math.max(1, Math.floor(yearlyResults.length / 6)) === 0).map((r) => (
          <text key={r.age} x={xScale(r.age)} y={H + 18}
            textAnchor="middle" fill="var(--chart-axis)" fontSize={10}>
            {r.age}
          </text>
        ))}

        {/* Y-axis */}
        <line x1={0} y1={0} x2={0} y2={H} stroke="var(--chart-axis)" />
        {yTicks.map((v) => (
          <text key={v} x={-6} y={yScale(v) + 4}
            textAnchor="end" fill="var(--chart-axis)" fontSize={10}>
            {formatMoneyAbbreviated(v)}
          </text>
        ))}

        {/* Labels */}
        <text x={W} y={yScale(yearlyResults.at(-1)!.p90) - 4}
          textAnchor="end" fill="var(--ink-3)" fontSize={10}>P90</text>
        <text x={W} y={yScale(yearlyResults.at(-1)!.p50) - 4}
          textAnchor="end" fill="var(--ink)" fontSize={10} fontWeight="500">P50</text>
        <text x={W} y={yScale(yearlyResults.at(-1)!.p10) + 12}
          textAnchor="end" fill="var(--ink-3)" fontSize={10}>P10</text>
      </g>
    </svg>
  )
}
