import { useState } from 'react'
import { useStore } from '../../store'
import { Seg } from '../shared/Field'
import type { Breakpoint } from '../../schema'

type Series = 'growth' | 'inflation' | 'both'

interface Segment {
  index: number
  startAge: number
  endAge: number
  stockGrowthMin: number
  stockGrowthMax: number
  inflationMin: number
  inflationMax: number
}

/**
 * Derive the list of segments from the initial-segment fields + breakpoints array.
 * Index 0 is the initial segment; index k >= 1 is breakpoints[k-1].
 */
function buildSegments(inputs: ReturnType<typeof useStore.getState>['inputs']): Segment[] {
  const { person, breakpoints } = inputs
  const segs: Segment[] = []
  // Initial segment
  const endAge0 = breakpoints[0]?.startAge ?? person.maxAge
  segs.push({
    index: 0,
    startAge: person.currentAge,
    endAge: endAge0,
    stockGrowthMin: inputs.initialStockGrowthMin,
    stockGrowthMax: inputs.initialStockGrowthMax,
    inflationMin: inputs.initialInflationMin,
    inflationMax: inputs.initialInflationMax,
  })
  // Breakpoint segments
  for (let k = 0; k < breakpoints.length; k++) {
    const bp = breakpoints[k]
    const end = breakpoints[k + 1]?.startAge ?? person.maxAge
    segs.push({
      index: k + 1,
      startAge: bp.startAge,
      endAge: end,
      stockGrowthMin: bp.stockGrowthMin,
      stockGrowthMax: bp.stockGrowthMax,
      inflationMin: bp.inflationMin,
      inflationMax: bp.inflationMax,
    })
  }
  return segs
}

function fmtPct(v: number): string {
  return (v * 100).toFixed(0)
}

function BreakpointsTimeline({
  segments,
  series,
  onSeriesChange,
  startAge,
  endAge,
  onShiftBreakpoint,
}: {
  segments: Segment[]
  series: Series
  onSeriesChange: (s: Series) => void
  startAge: number
  endAge: number
  /** Shift the breakpoint at `breakpointIndex` (0-based, NOT counting the initial segment)
   *  by `delta` years. Receiver clamps + sorts. */
  onShiftBreakpoint?: (breakpointIndex: number, delta: number) => void
}) {
  const width = 800
  const height = 200
  const pad = { l: 40, r: 40, t: 30, b: 40 }
  const cw = width - pad.l - pad.r
  const ageToX = (a: number) => pad.l + ((a - startAge) / (endAge - startAge)) * cw

  const showGrowth = series !== 'inflation'
  const showInflation = series !== 'growth'

  return (
    <div
      aria-label="Breakpoints timeline"
      className="card"
      style={{ padding: 20 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="label">return &amp; inflation band by age</div>
        <Seg
          aria-label="Series"
          value={series}
          onChange={(v) => onSeriesChange(v as Series)}
          options={[
            { value: 'growth', label: 'growth' },
            { value: 'inflation', label: 'inflation' },
            { value: 'both', label: 'both' },
          ]}
        />
      </div>

      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Growth and inflation bands by age">
        {/* Background bands per segment */}
        {segments.map((seg) => {
          const x = ageToX(seg.startAge)
          const w = ageToX(seg.endAge) - x
          const max = showGrowth ? seg.stockGrowthMax : seg.inflationMax
          const min = showGrowth ? seg.stockGrowthMin : seg.inflationMin
          const mid = (max + min) / 2
          // Scale: 0–15% maps to top→bottom region
          const yFor = (v: number) => pad.t + (1 - v / 0.15) * (height - pad.t - pad.b)
          return (
            <g key={seg.index}>
              {/* Band: max (top) to min (bottom) */}
              <rect
                x={x}
                y={yFor(max)}
                width={w}
                height={yFor(min) - yFor(max)}
                fill="var(--chart-band)"
                stroke="var(--accent)"
                strokeWidth="1"
                opacity={seg.index === 0 ? 1 : 0.7}
              />
              <line x1={x} y1={yFor(max)} x2={x + w} y2={yFor(max)} stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.7" />
              <line x1={x} y1={yFor(mid)} x2={x + w} y2={yFor(mid)} stroke="var(--ink)" strokeWidth="2" />
              <line x1={x} y1={yFor(min)} x2={x + w} y2={yFor(min)} stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.7" />

              <text x={x + 8} y={yFor(max) - 4} fontFamily="var(--font-body)" fontSize="11" fill="var(--accent-ink)">
                P90 · {fmtPct(max)}%
              </text>
              <text x={x + 8} y={yFor(mid) + 14} fontFamily="var(--font-body)" fontSize="11" fill="var(--ink)" fontWeight="500">
                P50 · {fmtPct(mid)}%
              </text>
              <text x={x + 8} y={yFor(min) + 14} fontFamily="var(--font-body)" fontSize="11" fill="var(--accent-ink)">
                P10 · {fmtPct(min)}%
              </text>

              {/* Inflation band (translucent overlay) when 'both' */}
              {showInflation && showGrowth && (
                <g opacity="0.4">
                  <rect
                    x={x}
                    y={yFor(seg.inflationMax)}
                    width={w}
                    height={yFor(seg.inflationMin) - yFor(seg.inflationMax)}
                    fill="none"
                    stroke="var(--ink-3)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                </g>
              )}
            </g>
          )
        })}

        {/* Breakpoint dividers + click-shift handles.
            `seg.index` is the position in `segments` (initial is index 0).
            The breakpoint index in `inputs.breakpoints` is `seg.index - 1`. */}
        {segments.slice(1).map((seg) => {
          const x = ageToX(seg.startAge)
          const bpIdx = seg.index - 1
          const handleH = height - pad.b - (pad.t - 10) + 14
          const handleY = pad.t - 10
          return (
            <g key={seg.index}>
              <line
                x1={x}
                y1={handleY}
                x2={x}
                y2={height - pad.b + 4}
                stroke="var(--ink)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              {onShiftBreakpoint && (
                <>
                  <rect
                    data-breakpoint-handle={bpIdx}
                    data-direction="left"
                    x={x - 10}
                    y={handleY}
                    width={10}
                    height={handleH}
                    fill="transparent"
                    style={{ cursor: 'w-resize' }}
                    onClick={() => onShiftBreakpoint(bpIdx, -1)}
                  >
                    <title>Shift breakpoint earlier (−1 year)</title>
                  </rect>
                  <rect
                    data-breakpoint-handle={bpIdx}
                    data-direction="right"
                    x={x}
                    y={handleY}
                    width={10}
                    height={handleH}
                    fill="transparent"
                    style={{ cursor: 'e-resize' }}
                    onClick={() => onShiftBreakpoint(bpIdx, 1)}
                  >
                    <title>Shift breakpoint later (+1 year)</title>
                  </rect>
                </>
              )}
            </g>
          )
        })}

        {/* X-axis */}
        <line x1={pad.l} y1={height - pad.b} x2={pad.l + cw} y2={height - pad.b} stroke="var(--chart-axis)" strokeWidth="1" />
        {Array.from({ length: 7 }, (_, i) => startAge + Math.round(((endAge - startAge) / 6) * i)).map((a) => (
          <g key={a}>
            <line x1={ageToX(a)} y1={height - pad.b} x2={ageToX(a)} y2={height - pad.b + 4} stroke="var(--chart-axis)" />
            <text x={ageToX(a)} y={height - pad.b + 18} fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)" textAnchor="middle">{a}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function SegmentCard({
  seg,
  active,
  onSelect,
  onPatch,
}: {
  seg: Segment
  active: boolean
  onSelect: () => void
  onPatch: (patch: Partial<Segment>) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className="card"
      style={{
        flex: 1,
        padding: 16,
        cursor: 'pointer',
        borderColor: active ? 'var(--ink)' : 'var(--line)',
        boxShadow: active ? '0 0 0 1px var(--ink)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div>
          <div className="label">segment {seg.index + 1}</div>
          <div style={{ fontSize: 14, color: 'var(--ink)', marginTop: 2 }}>
            age <span className="num">{seg.startAge}</span> → <span className="num">{seg.endAge}</span>
          </div>
        </div>
        {active && <span className="badge badge-accent">editing</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div className="micro">stock growth · P10–P90</div>
          <div className="field-row" style={{ marginTop: 4 }}>
            <input
              type="number"
              className="field field-num"
              step="0.5"
              style={{ width: 64, padding: '0 8px', height: 30 }}
              value={(seg.stockGrowthMin * 100).toFixed(1)}
              onChange={(e) => onPatch({ stockGrowthMin: Number(e.target.value) / 100 })}
              aria-label={`Segment ${seg.index + 1} stock growth P10`}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="muted">–</span>
            <input
              type="number"
              className="field field-num"
              step="0.5"
              style={{ width: 64, padding: '0 8px', height: 30 }}
              value={(seg.stockGrowthMax * 100).toFixed(1)}
              onChange={(e) => onPatch({ stockGrowthMax: Number(e.target.value) / 100 })}
              aria-label={`Segment ${seg.index + 1} stock growth P90`}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="muted" style={{ fontSize: 12 }}>%</span>
          </div>
        </div>
        <div>
          <div className="micro">inflation · P10–P90</div>
          <div className="field-row" style={{ marginTop: 4 }}>
            <input
              type="number"
              className="field field-num"
              step="0.5"
              style={{ width: 64, padding: '0 8px', height: 30 }}
              value={(seg.inflationMin * 100).toFixed(1)}
              onChange={(e) => onPatch({ inflationMin: Number(e.target.value) / 100 })}
              aria-label={`Segment ${seg.index + 1} inflation P10`}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="muted">–</span>
            <input
              type="number"
              className="field field-num"
              step="0.5"
              style={{ width: 64, padding: '0 8px', height: 30 }}
              value={(seg.inflationMax * 100).toFixed(1)}
              onChange={(e) => onPatch({ inflationMax: Number(e.target.value) / 100 })}
              aria-label={`Segment ${seg.index + 1} inflation P90`}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="muted" style={{ fontSize: 12 }}>%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MarketsStep() {
  const inputs = useStore((s) => s.inputs)
  const patchInputs = useStore((s) => s.patchInputs)
  const [series, setSeries] = useState<Series>('growth')
  const [activeIdx, setActiveIdx] = useState(0)

  const segments = buildSegments(inputs)
  const startAge = inputs.person.currentAge
  const endAge = inputs.person.maxAge

  const patchSegment = (idx: number, patch: Partial<Segment>) => {
    if (idx === 0) {
      const m: Record<string, keyof typeof inputs> = {
        stockGrowthMin: 'initialStockGrowthMin',
        stockGrowthMax: 'initialStockGrowthMax',
        inflationMin: 'initialInflationMin',
        inflationMax: 'initialInflationMax',
      }
      const inputPatch: Partial<typeof inputs> = {}
      for (const k of Object.keys(patch) as (keyof Segment)[]) {
        const target = m[k as string]
        if (target) {
          ;(inputPatch as Record<string, number>)[target] = patch[k] as number
        }
      }
      patchInputs(inputPatch)
    } else {
      const bpIdx = idx - 1
      const newBps: Breakpoint[] = inputs.breakpoints.map((bp, i) => (i === bpIdx ? { ...bp, ...patch } : bp))
      patchInputs({ breakpoints: newBps })
    }
  }

  const addBreakpoint = () => {
    // Insert a breakpoint mid-range, copying initial segment rates as a starting point
    const lastEnd = segments.at(-1)!.endAge
    const lastStart = segments.at(-1)!.startAge
    const mid = Math.round((lastStart + lastEnd) / 2)
    const newBp: Breakpoint = {
      startAge: mid,
      stockGrowthMin: inputs.initialStockGrowthMin,
      stockGrowthMax: inputs.initialStockGrowthMax,
      inflationMin: inputs.initialInflationMin,
      inflationMax: inputs.initialInflationMax,
    }
    const next = [...inputs.breakpoints, newBp].sort((a, b) => a.startAge - b.startAge)
    patchInputs({ breakpoints: next })
    setActiveIdx(next.findIndex((b) => b.startAge === mid) + 1)
  }

  const shiftBreakpoint = (bpIdx: number, delta: number) => {
    const cur = inputs.breakpoints[bpIdx]
    if (!cur) return
    const minAge = bpIdx === 0 ? inputs.person.currentAge + 1 : inputs.breakpoints[bpIdx - 1].startAge + 1
    const maxAge = bpIdx === inputs.breakpoints.length - 1 ? inputs.person.maxAge - 1 : inputs.breakpoints[bpIdx + 1].startAge - 1
    const nextAge = Math.max(minAge, Math.min(maxAge, cur.startAge + delta))
    if (nextAge === cur.startAge) return
    const newBps = inputs.breakpoints.map((bp, i) => (i === bpIdx ? { ...bp, startAge: nextAge } : bp))
    patchInputs({ breakpoints: newBps })
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 6 }}>Step 3 of 6 · markets</div>
        <h1>Set return and inflation assumptions</h1>
      </div>

      <p className="muted" style={{ fontSize: 14, marginBottom: 20, maxWidth: 640 }}>
        Drag in a breakpoint when your assumptions should change — common pattern: lower growth post-retirement.
      </p>

      <BreakpointsTimeline
        segments={segments}
        series={series}
        onSeriesChange={setSeries}
        startAge={startAge}
        endAge={endAge}
        onShiftBreakpoint={shiftBreakpoint}
      />

      <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        {segments.map((seg) => (
          <SegmentCard
            key={seg.index}
            seg={seg}
            active={seg.index === activeIdx}
            onSelect={() => setActiveIdx(seg.index)}
            onPatch={(patch) => patchSegment(seg.index, patch)}
          />
        ))}
        <button
          type="button"
          onClick={addBreakpoint}
          className="card"
          style={{
            flex: 1,
            minWidth: 200,
            padding: 16,
            border: '1px dashed var(--line-strong)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-3)',
            cursor: 'pointer',
            background: 'transparent',
            font: 'inherit',
          }}
        >
          <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 4 }}>＋</div>
          <div style={{ fontSize: 12 }}>add breakpoint</div>
        </button>
      </div>

      <div
        className="card card-sunk"
        style={{
          padding: 14,
          marginTop: 16,
          display: 'flex',
          gap: 12,
          fontSize: 12,
          color: 'var(--ink-3)',
          alignItems: 'flex-start',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ flex: 'none', marginTop: 1 }} aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7 4 V 8 M7 9.6 V 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <div>
          <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Monte Carlo simplification.</b>{' '}
          We sample one draw of growth and inflation per segment per run (not per year), and treat them as independent. Historically they're slightly negatively correlated.
        </div>
      </div>
    </div>
  )
}
