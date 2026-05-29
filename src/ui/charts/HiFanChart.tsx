import { useState } from 'react'
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
  /** Hide the 90th-percentile line/band and rescale to the P50 max for readability */
  hideP90?: boolean
}

const PAD = { top: 16, right: 48, bottom: 32, left: 56 }

export function HiFanChart({ result, width = 560, height = 280, retireAge, depleted = false, depleteAge, inline = false, hideP90 = false }: Props) {
  const { yearlyResults } = result
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  if (!yearlyResults.length) return null

  const W = width - PAD.left - PAD.right
  const H = height - PAD.top - PAD.bottom

  // When P90 is hidden, scale the Y-axis to the P50 max so the median and P10
  // bands aren't squashed against the bottom by the (now-hidden) P90 ceiling.
  const maxVal = hideP90
    ? Math.max(...yearlyResults.map((r) => r.p50), 1)
    : Math.max(...yearlyResults.map((r) => r.p90))
  const minAge = yearlyResults[0].age - 1
  const maxAge = yearlyResults.at(-1)!.age

  const xScale = (age: number) => ((age - minAge) / (maxAge - minAge)) * W
  const yScale = (v: number) => H - (v / maxVal) * H

  const firstAge = yearlyResults[0].age
  // Calendar year the projection starts in, so the overlay can show "year" not
  // just "age". The first row's age is the current age, mapped to this year.
  const baseYear = new Date().getFullYear()

  // Map a pointer position to the nearest yearly-result index. Ages are spaced
  // one year apart, so we can round the fractional age directly.
  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left - PAD.left
    const age = minAge + (x / W) * (maxAge - minAge)
    const idx = Math.round(age - firstAge)
    if (!Number.isFinite(idx)) return
    setHoverIdx(Math.max(0, Math.min(yearlyResults.length - 1, idx)))
  }

  // Build SVG paths
  const p50points = yearlyResults.map((r) => `${xScale(r.age)},${yScale(r.p50)}`).join(' ')
  const p90points = yearlyResults.map((r) => `${xScale(r.age)},${yScale(r.p90)}`).join(' ')
  const p10points = yearlyResults.map((r) => `${xScale(r.age)},${yScale(r.p10)}`).join(' ')

  // Band fill path: upper boundary forward, p10 backward. When P90 is hidden the
  // upper boundary is P50 so the shaded region shows only the downside spread.
  const upperKey = hideP90 ? 'p50' : 'p90'
  const bandPath =
    `M ${yearlyResults.map((r) => `${xScale(r.age)},${yScale(r[upperKey])}`).join(' L ')} ` +
    `L ${[...yearlyResults].reverse().map((r) => `${xScale(r.age)},${yScale(r.p10)}`).join(' L ')} Z`

  // Y-axis ticks
  const numTicks = 5
  const yTicks = Array.from({ length: numTicks }, (_, i) => (maxVal / (numTicks - 1)) * i)

  return (
    <svg
      width={width}
      height={height}
      style={{ fontFamily: 'var(--font-mono)', overflow: 'visible', touchAction: 'none', cursor: 'crosshair' }}
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerLeave={() => setHoverIdx(null)}
    >
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
        {!hideP90 && (
          <polyline points={p90points} fill="none" stroke="var(--accent-soft)" strokeWidth={1} strokeDasharray="4 3" />
        )}

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
        {!hideP90 && (
          <text x={W} y={yScale(yearlyResults.at(-1)!.p90) - 4}
            textAnchor="end" fill="var(--ink-3)" fontSize={10}>P90</text>
        )}
        <text x={W} y={yScale(yearlyResults.at(-1)!.p50) - 4}
          textAnchor="end" fill="var(--ink)" fontSize={10} fontWeight="500">P50</text>
        <text x={W} y={yScale(yearlyResults.at(-1)!.p10) + 12}
          textAnchor="end" fill="var(--ink-3)" fontSize={10}>P10</text>

        {/* Hover overlay: crosshair, dots, and a value/year tooltip */}
        {hoverIdx !== null && (() => {
          const r = yearlyResults[hoverIdx]
          const cx = xScale(r.age)
          const rows: Array<[string, number]> = hideP90
            ? [['P50', r.p50], ['P10', r.p10]]
            : [['P90', r.p90], ['P50', r.p50], ['P10', r.p10]]
          const lineH = 15
          const boxW = 116
          const boxH = 18 + rows.length * lineH
          // Flip the tooltip to the left of the crosshair when it would overflow.
          const flip = cx + 12 + boxW > W
          const boxX = flip ? cx - 12 - boxW : cx + 12
          return (
            <g data-testid="fan-tooltip" pointerEvents="none">
              <line x1={cx} y1={0} x2={cx} y2={H} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 3" />
              {!hideP90 && <circle cx={cx} cy={yScale(r.p90)} r={3} fill="var(--accent-soft)" />}
              <circle cx={cx} cy={yScale(r.p50)} r={3.5} fill="var(--chart-line)" />
              <circle cx={cx} cy={yScale(r.p10)} r={3} fill="var(--accent-soft)" />
              <rect x={boxX} y={4} width={boxW} height={boxH} rx={6}
                fill="var(--surface)" stroke="var(--chart-grid)" strokeWidth={1} opacity={0.97} />
              <text x={boxX + 8} y={4 + 14} fill="var(--ink)" fontSize={11} fontWeight="600"
                fontFamily="var(--font-body)">
                age {r.age} · {baseYear + (r.age - firstAge)}
              </text>
              {rows.map(([label, val], i) => (
                <text key={label} x={boxX + 8} y={4 + 14 + (i + 1) * lineH}
                  fill="var(--ink-2)" fontSize={11}>
                  <tspan fill="var(--ink-3)">{label}</tspan>
                  <tspan x={boxX + boxW - 8} textAnchor="end" fill="var(--ink)">{formatMoneyAbbreviated(val)}</tspan>
                </text>
              ))}
            </g>
          )
        })()}
      </g>
    </svg>
  )
}
