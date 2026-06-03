/**
 * GuardrailTimeline — small markers under the paths chart showing the years where
 * a guardrails plan trims (bad) or raises (good) spending. Reframes "failure" as a
 * few leaner years rather than a cliff (methodology #11).
 */
export interface GuardrailTimelineProps {
  cutYears: number[]
  raiseYears: number[]
  currentAge: number
  maxAge: number
  width?: number
  /** Match the PathsChart left/right padding so markers line up under the chart. */
  padLeft?: number
  padRight?: number
}

export function GuardrailTimeline({
  cutYears,
  raiseYears,
  currentAge,
  maxAge,
  width = 1000,
  padLeft = 58,
  padRight = 18,
}: GuardrailTimelineProps) {
  const cw = width - padLeft - padRight
  const span = Math.max(1, maxAge - currentAge)
  const x = (age: number) => padLeft + ((age - currentAge) / span) * cw
  const h = 30
  return (
    <svg viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', height: 'auto', maxWidth: width }} role="img" aria-label="Spending adjustment years">
      <line x1={padLeft} y1={h / 2} x2={padLeft + cw} y2={h / 2} stroke="var(--line)" strokeWidth="1" />
      {cutYears.map((a) => (
        <rect key={`c${a}`} x={x(a) - 5} y={6} width="10" height={h - 12} rx="2" fill="var(--bad)" opacity="0.8" />
      ))}
      {raiseYears.map((a) => (
        <rect key={`r${a}`} x={x(a) - 5} y={6} width="10" height={h - 12} rx="2" fill="var(--good)" opacity="0.8" />
      ))}
      <text x={padLeft} y={h - 1} fontFamily="var(--font-body)" fontSize="10" fill="var(--ink-3)">spending adjusts</text>
    </svg>
  )
}
