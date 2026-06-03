/**
 * LegacyBar — the surplus / "money left over" distribution (over-spend framing).
 * A small horizontal range showing the P10–P90 of ending balance with the median
 * marked. Surfacing over-saving as its own outcome (methodology P0 #2).
 */
import { formatMoneyAbbreviated } from '../../math'

export interface LegacyBarProps {
  p10: number
  p50: number
  p90: number
  width?: number
}

export function LegacyBar({ p10, p50, p90, width = 320 }: LegacyBarProps) {
  const h = 56
  const pad = 10
  const cw = width - pad * 2
  const cap = Math.max(p90 * 1.05, 1)
  const x = (v: number) => pad + (Math.min(v, cap) / cap) * cw
  return (
    <svg width={width} height={h} style={{ display: 'block' }} role="img" aria-label="Money left over distribution">
      <rect x={x(p10)} y={20} width={Math.max(0, x(p90) - x(p10))} height={14} rx="7" fill="var(--good-soft)" />
      <line x1={x(p50)} y1={14} x2={x(p50)} y2={40} stroke="var(--good)" strokeWidth="2.4" />
      <circle cx={x(p10)} cy={27} r="3" fill="var(--good)" />
      <circle cx={x(p90)} cy={27} r="3" fill="var(--good)" />
      <text x={x(p10)} y={50} fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-3)" textAnchor="middle">{formatMoneyAbbreviated(p10)}</text>
      <text x={x(p50)} y={10} fontFamily="var(--font-mono)" fontSize="11" fill="var(--good)" textAnchor="middle">{formatMoneyAbbreviated(p50)}</text>
      <text x={x(p90)} y={50} fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-3)" textAnchor="middle">{formatMoneyAbbreviated(p90)}</text>
    </svg>
  )
}
