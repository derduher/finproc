import type { SensitivityResult } from '../../schema'

interface Props {
  data: SensitivityResult[]
  width?: number
  height?: number
}

export function HiTornado({ data, width = 460, height }: Props) {
  const BAR_H = 22
  const GAP = 14  // extra gap to accommodate sub label
  const PAD = { top: 24, right: 80, bottom: 24, left: 120 }
  const totalH = height ?? (data.length * (BAR_H + GAP) + PAD.top + PAD.bottom)
  const W = width - PAD.left - PAD.right

  // Find max impact for scale
  const maxImpact = Math.max(...data.map((d) => Math.max(Math.abs(d.loDelta), Math.abs(d.hiDelta))), 0.001)

  return (
    <svg width={width} height={totalH}>
      {/* Center line */}
      <line
        x1={PAD.left + W / 2} y1={PAD.top - 8}
        x2={PAD.left + W / 2} y2={totalH - PAD.bottom}
        stroke="var(--line-strong)" strokeWidth={1}
      />

      {/* Header labels */}
      <text x={PAD.left + W / 2 - 8} y={PAD.top - 8}
        textAnchor="end" fill="var(--bad)" fontSize={10}
        fontFamily="var(--font-body)" letterSpacing="0.06em">
        ← LOWER SUCCESS
      </text>
      <text x={PAD.left + W / 2 + 8} y={PAD.top - 8}
        textAnchor="start" fill="var(--good)" fontSize={10}
        fontFamily="var(--font-body)" letterSpacing="0.06em">
        HIGHER SUCCESS →
      </text>

      {data.map((d, i) => {
        const rowTopY = PAD.top + i * (BAR_H + GAP)
        const barY = rowTopY + (d.sub ? 4 : 0)
        const center = PAD.left + W / 2

        const loW = (Math.abs(d.loDelta) / maxImpact) * (W / 2)
        const hiW = (Math.abs(d.hiDelta) / maxImpact) * (W / 2)

        const isHot = i === 0 // top row = highest impact (results are sorted desc)

        return (
          <g key={d.label}>
            {/* Main label */}
            <text
              x={PAD.left - 8}
              y={barY + BAR_H / 2 + (d.sub ? -3 : 4)}
              textAnchor="end"
              fill="var(--ink)"
              fontSize={13}
              fontFamily="var(--font-body)"
            >
              {d.label}
            </text>

            {/* Sub label */}
            {d.sub && (
              <text
                x={PAD.left - 8}
                y={barY + BAR_H / 2 + 10}
                textAnchor="end"
                fill="var(--ink-3)"
                fontSize={10}
                fontFamily="var(--font-body)"
              >
                {d.sub}
              </text>
            )}

            {/* Lo bar (left of center) */}
            {d.loDelta !== 0 && (
              <rect
                data-hot={isHot ? 'true' : 'false'}
                x={center - loW} y={barY}
                width={loW} height={BAR_H}
                fill={d.loDelta > 0
                  ? (isHot ? 'var(--good)' : 'var(--good-soft)')
                  : (isHot ? 'var(--bad)' : 'var(--bg-sunk)')}
                stroke={isHot ? 'none' : 'var(--line-strong)'}
                rx={2}
              />
            )}

            {/* Hi bar (right of center) */}
            {d.hiDelta !== 0 && (
              <rect
                data-hot={isHot ? 'true' : 'false'}
                x={center} y={barY}
                width={hiW} height={BAR_H}
                fill={d.hiDelta > 0
                  ? (isHot ? 'var(--accent)' : 'var(--ink)')
                  : (isHot ? 'var(--bad)' : 'var(--bg-sunk)')}
                opacity={isHot ? 1 : 0.85}
                rx={2}
              />
            )}

            {/* Delta labels */}
            {Math.abs(d.loDelta) > 0.01 && (
              <text x={center - loW - 3} y={barY + BAR_H / 2 + 4}
                textAnchor="end" fill="var(--ink-3)" fontSize={9}
                fontFamily="var(--font-mono)">
                {(d.loDelta * 100).toFixed(0)}pp
              </text>
            )}
            {Math.abs(d.hiDelta) > 0.01 && (
              <text x={center + hiW + 3} y={barY + BAR_H / 2 + 4}
                textAnchor="start" fill="var(--ink-3)" fontSize={9}
                fontFamily="var(--font-mono)">
                +{(d.hiDelta * 100).toFixed(0)}pp
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
