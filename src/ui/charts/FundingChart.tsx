/**
 * FundingChart — "what you need at each age" against "what you'll have".
 *
 * Both series come from `runFundingCurve` and are already in today's dollars,
 * so this chart offers no nominal toggle: the requirement is solved by starting
 * a projection *at* each age, where the price level restarts at 1, and inflating
 * it back would mean multiplying by a stochastic price path.
 *
 * The crossing of the two lines is deliberately not presented as the answer.
 * It pits a median projection against a confidence-matched requirement, which
 * flatters the reader; the p10–p90 band shades the range of ages the crossing
 * could really fall in, and `earliestAge` (from `findRetirementAgeForSuccess`)
 * is marked separately as the rigorous figure.
 *
 * Pure/presentational — it renders whatever curve it's handed.
 */
import { useRef, useState, useId } from 'react'
import { formatMoneyAbbreviated } from '../../math'
import {
  requiredAt,
  crossingAge,
  crossingBand,
  fullyFundedAge,
  FUNDING_GHOST_CONFIDENCES,
} from '../../sim/fundingCurve'
import { ageAtFraction, fractionForClientX } from './pathsZoom'
import { tooltipBoxPosition } from './PathsChart'
import type { FundingCurvePoint, FundingCurveResult } from '../../sim/fundingCurve'

export interface FundingChartProps {
  result: FundingCurveResult
  /** Active confidence level (0..1) — drives which quantile is drawn solid. */
  confidence: number
  /** The solver's confidence-matched earliest retirement age, marked separately. */
  earliestAge?: number
  width?: number
  height?: number
  showLegend?: boolean
}

/**
 * Top of the y-axis.
 *
 * Two failure modes to avoid, pulling in opposite directions:
 *
 *  - Scaling to the p90 band lets a lucky tail press the crossing into the
 *    bottom sliver, so the band is excluded outright and allowed to clip.
 *  - Scaling to the median buries the requirement curve on a well-funded plan.
 *    A 39-year-old on track for $18M makes a $1.5M requirement a flat smear
 *    along the axis, which reads as "it never drops" when it drops tenfold.
 *
 * So the median sets the cap only within a window: never so low that the
 * requirement has no headroom, and never so high that the requirement occupies
 * less than {@link MIN_REQUIREMENT_SHARE} of the axis. Beyond that the median
 * clips, and the top tick carries a "+" to say so.
 */
const MIN_REQUIREMENT_SHARE = 0.35
const REQUIREMENT_HEADROOM = 1.35

export function fundingYCap(
  points: FundingCurvePoint[],
  confidence: number,
  pctl: number = 0.75,
): number {
  if (points.length === 0) return 1
  const medians: number[] = []
  let needMax = 0
  for (const p of points) {
    needMax = Math.max(needMax, requiredAt(p, confidence))
    medians.push(p.projected.p50)
  }
  medians.sort((a, b) => a - b)
  const medianCap = medians[Math.min(medians.length - 1, Math.floor(medians.length * pctl))] ?? 0
  // A plan with no requirement at all (guaranteed income covers everything) has
  // nothing to protect, so let the median have the axis.
  if (needMax <= 0) return Math.max(medianCap, 1)
  return Math.max(
    needMax * REQUIREMENT_HEADROOM,
    Math.min(medianCap, needMax / MIN_REQUIREMENT_SHARE),
    1,
  )
}

/** Index of the point nearest `age`, or null when the curve is empty. Pure. */
export function nearestPointIndex(points: FundingCurvePoint[], age: number): number | null {
  if (points.length === 0) return null
  const first = points[0].age
  return Math.min(points.length - 1, Math.max(0, Math.round(age - first)))
}

export function FundingChart({
  result,
  confidence,
  earliestAge,
  width = 1000,
  height = 380,
  showLegend = true,
}: FundingChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const clipId = useId()
  const plotRef = useRef<SVGRectElement>(null)
  const points = result.points

  const pad = { l: 58, r: 18, t: 18, b: 34 }
  const cw = width - pad.l - pad.r
  const ch = height - pad.t - pad.b

  if (points.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', width: '100%', height: 'auto', maxWidth: width }}
        role="img"
        aria-label="What you need against what you'll have"
      />
    )
  }

  const minAge = points[0].age
  const maxAgeShown = points[points.length - 1].age
  const span = Math.max(1, maxAgeShown - minAge)
  const cap = fundingYCap(points, confidence)

  const x = (age: number) => pad.l + ((age - minAge) / span) * cw
  const y = (v: number) => pad.t + ch - (Math.min(Math.max(v, 0), cap) / cap) * ch
  const lineOf = (value: (p: FundingCurvePoint) => number) =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.age).toFixed(1)} ${y(value(p)).toFixed(1)}`)
      .join(' ')

  const requiredLine = lineOf((p) => requiredAt(p, confidence))
  const projectedLine = lineOf((p) => p.projected.p50)
  const bandPolygon = [
    ...points.map((p) => `${x(p.age).toFixed(1)},${y(p.projected.p90).toFixed(1)}`),
    ...[...points].reverse().map((p) => `${x(p.age).toFixed(1)},${y(p.projected.p10).toFixed(1)}`),
  ].join(' ')

  const band = crossingBand(result, confidence)
  const medianCross = crossingAge(result, confidence, 'p50')
  // Shade the shortfall only when the plan never catches up inside the window.
  // In a healthy plan the early years are always "short" — shading them would
  // paint most of the chart red for no reason.
  const shortfallPolygon =
    medianCross === undefined
      ? [
          ...points.map((p) => `${x(p.age).toFixed(1)},${y(requiredAt(p, confidence)).toFixed(1)}`),
          ...[...points]
            .reverse()
            .map((p) => `${x(p.age).toFixed(1)},${y(p.projected.p50).toFixed(1)}`),
        ].join(' ')
      : undefined

  const yTicks = [0, cap * 0.5, cap]
  // The plan's own retirement age carries a label: an unexplained number on the
  // axis reads as a scale tick, not a reference line.
  const ageTicks = [
    ...new Set(
      [minAge, result.retirementAge, earliestAge, maxAgeShown].filter(
        (a): a is number => a != null && a >= minAge && a <= maxAgeShown,
      ),
    ),
  ]
    .sort((a, b) => a - b)
    .map((age) => ({ age, label: age === result.retirementAge ? `retire · ${age}` : String(age) }))

  // The rare case where guaranteed income covers the whole spend, so no
  // portfolio is required from here on.
  const fundedAge = fullyFundedAge(result, confidence)
  const showFunded = fundedAge !== undefined && fundedAge >= minAge && fundedAge <= maxAgeShown

  const onScrub = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const age = ageAtFraction([minAge, maxAgeShown], fractionForClientX(rect, e.clientX))
    setHoverIdx(nearestPointIndex(points, age))
  }

  const hovered = hoverIdx != null ? points[hoverIdx] : undefined
  const hoverNeed = hovered ? requiredAt(hovered, confidence) : 0
  const hoverHave = hovered?.projected.p50 ?? 0
  const hoverGap = hoverHave - hoverNeed
  const boxW = 178
  const boxH = 92
  const box = hovered
    ? tooltipBoxPosition(x(hovered.age), boxW, boxH, pad, cw, ch)
    : { bx: 0, by: 0 }

  // At phone width the full second label runs off the plot, so shorten it and
  // pull the two legend items closer together.
  const compactLegend = width < 560
  const legendGap = compactLegend ? 110 : 150

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: 'auto', maxWidth: width, touchAction: 'pan-y' }}
      role="img"
      aria-label={`What you need against what you'll have, ages ${minAge} to ${maxAgeShown}`}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={pad.l} y={pad.t} width={cw} height={ch} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* the ages the crossing could plausibly fall in */}
        {band.from !== undefined && (
          <rect
            x={x(band.from)}
            y={pad.t}
            width={Math.max(2, x(band.to ?? maxAgeShown) - x(band.from))}
            height={ch}
            fill="var(--ink)"
            opacity="0.06"
          />
        )}

        {yTicks.map((v, i) => (
          <line
            key={`g${i}`}
            x1={pad.l}
            y1={y(v)}
            x2={pad.l + cw}
            y2={y(v)}
            stroke="var(--chart-grid)"
            strokeWidth="1"
          />
        ))}

        <polygon points={bandPolygon} fill="var(--good)" opacity="0.14" />

        {shortfallPolygon && <polygon points={shortfallPolygon} fill="var(--bad)" opacity="0.1" />}

        {FUNDING_GHOST_CONFIDENCES.map((c) => (
          <path
            key={`ghost${c}`}
            d={lineOf((p) => requiredAt(p, c))}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.4"
            strokeDasharray="4 4"
            opacity="0.34"
            strokeLinejoin="round"
          />
        ))}

        <path
          d={requiredLine}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={projectedLine}
          fill="none"
          stroke="var(--good)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {earliestAge !== undefined && earliestAge >= minAge && earliestAge <= maxAgeShown && (
          <line
            x1={x(earliestAge)}
            y1={pad.t}
            x2={x(earliestAge)}
            y2={pad.t + ch}
            stroke="var(--ink-2)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        )}

        {showFunded && (
          <line
            x1={x(fundedAge)}
            y1={pad.t}
            x2={x(fundedAge)}
            y2={pad.t + ch}
            stroke="var(--good)"
            strokeWidth="1.5"
            strokeDasharray="2 4"
          />
        )}

        {hovered && (
          <line
            x1={x(hovered.age)}
            y1={pad.t}
            x2={x(hovered.age)}
            y2={pad.t + ch}
            stroke="var(--ink-3)"
            strokeWidth="1"
          />
        )}
      </g>

      {earliestAge !== undefined && earliestAge >= minAge && earliestAge <= maxAgeShown && (
        <text
          x={Math.min(x(earliestAge) + 6, pad.l + cw - 132)}
          y={pad.t + ch - 8}
          fontFamily="var(--font-body)"
          fontSize="11"
          fill="var(--ink-2)"
        >
          earliest age · {earliestAge}
        </text>
      )}

      {showFunded && (
        <text
          x={Math.min(x(fundedAge) + 6, pad.l + cw - 150)}
          y={pad.t + ch - 26}
          fontFamily="var(--font-body)"
          fontSize="11"
          fill="var(--good)"
        >
          no portfolio needed · {fundedAge}
        </text>
      )}

      {hovered && (
        <g>
          <circle cx={x(hovered.age)} cy={y(hoverNeed)} r="4" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
          <circle cx={x(hovered.age)} cy={y(hoverHave)} r="4" fill="var(--good)" stroke="var(--bg)" strokeWidth="2" />
          <rect
            x={box.bx}
            y={box.by}
            width={boxW}
            height={boxH}
            rx="6"
            fill="var(--bg-elev)"
            stroke="var(--line)"
          />
          <text x={box.bx + 12} y={box.by + 22} fontFamily="var(--font-body)" fontSize="12" fill="var(--ink)">
            age {hovered.age}
          </text>
          <text x={box.bx + 12} y={box.by + 42} fontFamily="var(--font-body)" fontSize="11.5" fill="var(--ink-3)">
            needed
          </text>
          <text
            x={box.bx + boxW - 12}
            y={box.by + 42}
            fontFamily="var(--font-mono)"
            fontSize="11.5"
            fill="var(--ink)"
            textAnchor="end"
          >
            {formatMoneyAbbreviated(hoverNeed)}
          </text>
          <text x={box.bx + 12} y={box.by + 60} fontFamily="var(--font-body)" fontSize="11.5" fill="var(--ink-3)">
            projected
          </text>
          <text
            x={box.bx + boxW - 12}
            y={box.by + 60}
            fontFamily="var(--font-mono)"
            fontSize="11.5"
            fill="var(--ink)"
            textAnchor="end"
          >
            {formatMoneyAbbreviated(hoverHave)}
          </text>
          <text x={box.bx + 12} y={box.by + 78} fontFamily="var(--font-body)" fontSize="11.5" fill="var(--ink-3)">
            {hoverGap >= 0 ? 'surplus' : 'short by'}
          </text>
          <text
            x={box.bx + boxW - 12}
            y={box.by + 78}
            fontFamily="var(--font-mono)"
            fontSize="11.5"
            fill={hoverGap >= 0 ? 'var(--good)' : 'var(--bad)'}
            textAnchor="end"
          >
            {formatMoneyAbbreviated(Math.abs(hoverGap))}
          </text>
        </g>
      )}

      <line
        x1={pad.l}
        y1={pad.t + ch}
        x2={pad.l + cw}
        y2={pad.t + ch}
        stroke="var(--chart-axis)"
        strokeWidth="1"
      />
      {yTicks.map((v, i) => (
        <text
          key={`yt${i}`}
          x={pad.l - 8}
          y={y(v) + 3}
          fontFamily="var(--font-mono)"
          fontSize="11"
          fill="var(--ink-3)"
          textAnchor="end"
        >
          {formatMoneyAbbreviated(v)}
          {i === yTicks.length - 1 ? '+' : ''}
        </text>
      ))}
      {ageTicks.map(({ age, label }) => (
        <text
          key={`xt${age}`}
          x={Math.max(pad.l + 16, Math.min(x(age), pad.l + cw - 16))}
          y={pad.t + ch + 18}
          fontFamily="var(--font-mono)"
          fontSize="11"
          fill="var(--ink-3)"
          textAnchor="middle"
        >
          {label}
        </text>
      ))}

      {showLegend && (
        <g>
          <line x1={pad.l} y1={pad.t + 6} x2={pad.l + 18} y2={pad.t + 6} stroke="var(--accent)" strokeWidth="2.2" />
          <text x={pad.l + 24} y={pad.t + 10} fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)">
            needed at {Math.round(confidence * 100)}%
          </text>
          <line
            x1={pad.l + legendGap}
            y1={pad.t + 6}
            x2={pad.l + legendGap + 18}
            y2={pad.t + 6}
            stroke="var(--good)"
            strokeWidth="2.2"
          />
          <text x={pad.l + legendGap + 24} y={pad.t + 10} fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)">
            {compactLegend ? 'projected' : 'projected if you work to that age'}
          </text>
        </g>
      )}

      <rect
        ref={plotRef}
        x={pad.l}
        y={pad.t}
        width={cw}
        height={ch}
        fill="transparent"
        onPointerMove={onScrub}
        onPointerDown={onScrub}
        onPointerLeave={() => setHoverIdx(null)}
      />
    </svg>
  )
}
