import { Stage } from './Stage'
import type { ProgressEvent, ProgressStage } from '../../sim/montecarlo'

// ── Spinner (inline, small) ───────────────────────────────────────────────────

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ animation: 'spin 0.9s linear infinite', transformOrigin: 'center' }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="M 12 2 A 10 10 0 0 1 22 12" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

// ── Stage metadata ────────────────────────────────────────────────────────────

const STAGES: Array<{ key: ProgressStage; label: string }> = [
  { key: 'parse', label: 'parse inputs' },
  { key: 'sample', label: 'sample rates' },
  { key: 'project', label: 'project balances' },
  { key: 'aggregate', label: 'aggregate percentiles' },
]

function stageState(
  stageKey: ProgressStage,
  current: ProgressStage | undefined,
): 'done' | 'active' | 'pending' {
  if (!current) return 'pending'
  const order = STAGES.map((s) => s.key)
  const currentIdx = order.indexOf(current)
  const thisIdx = order.indexOf(stageKey)
  if (thisIdx < currentIdx) return 'done'
  if (thisIdx === currentIdx) return 'active'
  return 'pending'
}

// ── Skeleton tile ─────────────────────────────────────────────────────────────

function SkelTile({ h = 120, accent = false }: { h?: number; accent?: boolean }) {
  return (
    <div className="card" style={{ padding: 20, height: h, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="skel" style={{ width: 80, height: 10 }} />
      <div
        className="skel"
        style={{ width: 110, height: 36, background: accent ? 'var(--accent-soft)' : undefined }}
      />
      <div className="skel" style={{ width: 140, height: 10, opacity: 0.6 }} />
    </div>
  )
}

// ── LoadingState ──────────────────────────────────────────────────────────────

interface Props {
  progress?: ProgressEvent
  onCancel?: () => void
  seedHex?: string
}

export function LoadingState({ progress, onCancel, seedHex }: Props) {
  const currentStage = progress?.stage
  const done = progress?.done ?? 0
  const total = progress?.total ?? 1000

  // For the 'project' stage, done/total tracks runs. For others, it's always 1/1.
  const pct =
    currentStage === 'project'
      ? (done / total) * 100
      : currentStage === 'aggregate'
        ? 100
        : currentStage === 'sample' || currentStage === 'parse'
          ? 0
          : 0

  const runsDisplay = currentStage === 'project' ? done : currentStage === 'aggregate' ? total : 0

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Progress card ── */}
      <div className="card" style={{ padding: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 18,
          }}
        >
          <div>
            <div className="label">simulation progress</div>
            <h2 style={{ marginTop: 4 }}>
              <span className="num">{runsDisplay.toLocaleString()}</span>
              <span className="muted" style={{ fontFamily: 'var(--font-body)' }}>
                {' '}
                / {total.toLocaleString()} runs
              </span>
            </h2>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
              Stock growth and inflation sampled per breakpoint segment
              {seedHex && (
                <>
                  {' '}
                  · seed <span className="num">{seedHex}</span>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--ink-2)',
              }}
            >
              <Spinner size={14} />
              running in worker
            </div>
            {onCancel && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 8,
            background: 'var(--bg-sunk)',
            borderRadius: 4,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            data-testid="progress-bar"
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--accent)',
              borderRadius: 4,
              transition: 'width 0.3s',
            }}
          />
          {pct > 0 && pct < 100 && (
            <div
              className="skel"
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: 0,
                height: '100%',
                width: '12%',
                opacity: 0.6,
              }}
            />
          )}
        </div>

        {/* Sub-stages */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginTop: 18,
          }}
        >
          {STAGES.map((s) => (
            <Stage
              key={s.key}
              state={stageState(s.key, currentStage)}
              label={s.label}
              eta={
                stageState(s.key, currentStage) === 'done'
                  ? '✓'
                  : stageState(s.key, currentStage) === 'active'
                    ? '…'
                    : '—'
              }
            />
          ))}
        </div>
      </div>

      {/* ── Metric card skeletons ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 12 }}>
        <SkelTile h={120} accent />
        <SkelTile h={120} />
        <SkelTile h={120} />
        <SkelTile h={120} />
      </div>

      {/* ── Fan chart skeleton ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div className="skel" style={{ width: 180, height: 18, marginBottom: 6 }} />
            <div className="skel" style={{ width: 320, height: 11 }} />
          </div>
          <div className="skel" style={{ width: 110, height: 28 }} />
        </div>
        <div className="skel" style={{ width: '100%', height: 280, borderRadius: 8, opacity: 0.6 }} />
      </div>

      {/* ── Cashflow + tornado skeletons ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        <div className="card" style={{ padding: 20, minHeight: 200 }}>
          <div className="skel" style={{ width: 140, height: 16, marginBottom: 14 }} />
          <div className="skel" style={{ width: '100%', height: 140, opacity: 0.6 }} />
        </div>
        <div className="card" style={{ padding: 20, minHeight: 200 }}>
          <div className="skel" style={{ width: 160, height: 16, marginBottom: 14 }} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div className="skel" style={{ width: 70, height: 12 }} />
              <div className="skel" style={{ flex: 1, height: 14, opacity: 0.5 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── StaleBadge (used by ResultsStep when stale) ───────────────────────────────

export function StaleBadge() {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 99,
        background: 'var(--accent-soft)',
        color: 'var(--accent-ink)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
      }}
    >
      <Spinner size={10} />
      UPDATING
    </div>
  )
}
