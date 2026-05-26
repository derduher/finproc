import { useStore } from '../../store'
import { WithdrawalStrategy } from '../../schema'

interface PillProps {
  active: boolean
  title: string
  sub: string
  successPct: number | string
  delta: number | string
  onSelect: () => void
}

function StrategyPill({ active, title, sub, successPct, delta, onSelect }: PillProps) {
  const isNegative = typeof delta === 'number' && delta < 0
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
        padding: 14,
        cursor: 'pointer',
        borderColor: active ? 'var(--ink)' : 'var(--line)',
        boxShadow: active ? '0 0 0 1px var(--ink)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            border: `1.4px solid ${active ? 'var(--ink)' : 'var(--line-strong)'}`,
            background: active ? 'var(--ink)' : 'transparent',
            position: 'relative',
          }}
        >
          {active && (
            <div
              style={{
                position: 'absolute',
                inset: 3,
                borderRadius: 999,
                background: 'var(--bg)',
              }}
            />
          )}
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: active ? 500 : 400 }}>{title}</div>
        {active && <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>active</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>{sub}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
        <span className="num" style={{ fontSize: 20, color: 'var(--ink)' }}>
          {typeof successPct === 'number' ? `${successPct}%` : successPct}
        </span>
        <span
          style={{
            fontSize: 11,
            color: isNegative ? 'var(--bad)' : 'var(--ink-3)',
          }}
        >
          success{' '}
          {typeof delta === 'number' ? (delta > 0 ? `+${delta}%` : `${delta}%`) : delta}
        </span>
      </div>
    </div>
  )
}

function MoneyFlowDiagram({ activeStrategy }: { activeStrategy: WithdrawalStrategy }) {
  const isTaxOptimal = activeStrategy === WithdrawalStrategy.TaxOptimal
  const isProportional = activeStrategy === WithdrawalStrategy.Proportional

  return (
    <div aria-label="Withdrawal money flow diagram" className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="label">withdrawal order · age 65</div>
        <div className="muted" style={{ fontSize: 12 }}>animated — dashed lines show active flow</div>
      </div>

      <svg width="100%" height="340" viewBox="0 0 920 340" role="img" aria-label="Source buckets to expenses flow">
        <defs>
          <marker id="flow-ink" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
            <path d="M0 0 L10 5 L0 10 Z" fill="var(--ink)" />
          </marker>
          <marker id="flow-mute" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
            <path d="M0 0 L10 5 L0 10 Z" fill="var(--ink-3)" />
          </marker>
          <marker id="flow-bad" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
            <path d="M0 0 L10 5 L0 10 Z" fill="var(--bad)" />
          </marker>
        </defs>

        {/* SOURCE BUCKETS — taxable */}
        <g opacity={isTaxOptimal ? 1 : isProportional ? 0.9 : 0.7}>
          <rect x="40" y="40" width="200" height="76" rx="6" fill="var(--bg-elev)" stroke="var(--ink)" strokeWidth={isTaxOptimal ? '1.4' : '1'} />
          <text x="56" y="62" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)" letterSpacing="0.06em">
            {isTaxOptimal ? '1 · TAXABLE' : 'TAXABLE'}
          </text>
          <text x="56" y="88" fontFamily="var(--font-display)" fontSize="22" fill="var(--ink)">Brokerage</text>
          <text x="56" y="106" fontFamily="var(--font-mono)" fontSize="13" fill="var(--ink-2)">first to drain</text>
        </g>

        {/* Traditional */}
        <g opacity={isTaxOptimal ? 0.85 : isProportional ? 0.9 : 0.7}>
          <rect x="40" y="140" width="200" height="76" rx="6" fill="var(--bg-elev)" stroke="var(--line-strong)" strokeWidth="1.2" strokeDasharray={isTaxOptimal ? '3 3' : '0'} />
          <text x="56" y="162" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)" letterSpacing="0.06em">
            {isTaxOptimal ? '2 · TRADITIONAL' : 'TRADITIONAL'}
          </text>
          <text x="56" y="188" fontFamily="var(--font-display)" fontSize="22" fill="var(--ink)">401(k)</text>
          <text x="56" y="206" fontFamily="var(--font-mono)" fontSize="13" fill="var(--ink-2)">
            {isTaxOptimal ? 'taps next' : 'proportional draw'}
          </text>
        </g>

        {/* Roth */}
        <g opacity={isTaxOptimal ? 0.55 : isProportional ? 0.9 : 0.7}>
          <rect x="40" y="240" width="200" height="60" rx="6" fill="var(--bg-elev)" stroke="var(--line)" strokeWidth="1" strokeDasharray={isTaxOptimal ? '2 3' : '0'} />
          <text x="56" y="262" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)" letterSpacing="0.06em">
            {isTaxOptimal ? '3 · ROTH' : 'ROTH'}
          </text>
          <text x="56" y="282" fontFamily="var(--font-display)" fontSize="18" fill="var(--ink-2)">Roth IRA</text>
        </g>

        {/* NET CASH bucket */}
        <g>
          <rect x="420" y="120" width="120" height="120" rx="6" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.4" />
          <text x="480" y="144" fontFamily="var(--font-body)" fontSize="11" fill="var(--accent-ink)" letterSpacing="0.06em" textAnchor="middle">NET CASH</text>
          <text x="480" y="180" fontFamily="var(--font-mono)" fontSize="22" fill="var(--accent-ink)" textAnchor="middle">$94K</text>
          <text x="480" y="200" fontFamily="var(--font-body)" fontSize="10" fill="var(--accent-ink)" textAnchor="middle">needed this year</text>
        </g>

        {/* SPENT bucket */}
        <g>
          <rect x="680" y="80" width="200" height="180" rx="6" fill="var(--bg-sunk)" stroke="var(--ink)" strokeWidth="1.4" />
          <text x="696" y="106" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)" letterSpacing="0.06em">SPENT</text>
          <text x="696" y="138" fontFamily="var(--font-display)" fontSize="22" fill="var(--ink)">Living costs</text>
          <text x="696" y="158" fontFamily="var(--font-mono)" fontSize="13" fill="var(--ink-2)">$70K baseline</text>
          <text x="696" y="180" fontFamily="var(--font-mono)" fontSize="13" fill="var(--ink-2)">+ events</text>
          <text x="696" y="202" fontFamily="var(--font-mono)" fontSize="13" fill="var(--good)">− Soc Sec</text>
          <line x1="696" y1="218" x2="864" y2="218" stroke="var(--line)" />
          <text x="696" y="238" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)">NET NEED</text>
          <text x="864" y="238" fontFamily="var(--font-mono)" fontSize="14" fill="var(--ink)" textAnchor="end">$66K</text>
        </g>

        {/* Flow arrow 1: taxable → cash */}
        <path
          data-flow="taxable"
          data-active={isTaxOptimal ? '1' : isProportional ? 'proportional' : 'user'}
          d="M 240 78 Q 320 78, 360 130 L 420 165"
          fill="none"
          stroke={isTaxOptimal ? 'var(--ink)' : isProportional ? 'var(--ink)' : 'var(--ink-3)'}
          strokeWidth={isTaxOptimal ? '2.2' : isProportional ? '1.8' : '1.4'}
          className={isTaxOptimal || isProportional ? 'flow-dash' : undefined}
          strokeDasharray={!isTaxOptimal && !isProportional ? '3 5' : undefined}
          markerEnd={isTaxOptimal || isProportional ? 'url(#flow-ink)' : 'url(#flow-mute)'}
          opacity={isTaxOptimal ? 1 : isProportional ? 0.95 : 0.5}
        />

        {/* Flow arrow 2: traditional → cash */}
        <path
          data-flow="traditional"
          data-active={isTaxOptimal ? '2' : isProportional ? 'proportional' : 'user'}
          d="M 240 178 Q 320 178, 360 180 L 420 200"
          fill="none"
          stroke={isProportional ? 'var(--ink)' : isTaxOptimal ? 'var(--ink-2)' : 'var(--ink-3)'}
          strokeWidth={isProportional ? '1.8' : isTaxOptimal ? '1.6' : '1.4'}
          className={isTaxOptimal || isProportional ? 'flow-dash' : undefined}
          strokeDasharray={!isTaxOptimal && !isProportional ? '3 5' : undefined}
          markerEnd={isTaxOptimal || isProportional ? 'url(#flow-ink)' : 'url(#flow-mute)'}
          opacity={isProportional ? 0.95 : isTaxOptimal ? 0.85 : 0.5}
        />

        {/* Flow arrow 3: roth → cash */}
        <path
          data-flow="roth"
          data-active={isTaxOptimal ? '3' : isProportional ? 'proportional' : 'user'}
          d="M 240 270 Q 320 260, 360 235 L 420 220"
          fill="none"
          stroke={isProportional ? 'var(--ink-2)' : 'var(--ink-3)'}
          strokeWidth={isProportional ? '1.6' : '1.1'}
          className={isProportional ? 'flow-dash' : undefined}
          strokeDasharray={!isProportional ? '2 4' : undefined}
          markerEnd={isProportional ? 'url(#flow-ink)' : 'url(#flow-mute)'}
          opacity={isProportional ? 0.85 : isTaxOptimal ? 0.55 : 0.5}
        />

        {/* Cash → expenses */}
        <path
          d="M 540 180 L 680 180"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2.2"
          className="flow-dash"
          markerEnd="url(#flow-ink)"
        />

        {/* RMD floor */}
        <path
          d="M 200 215 Q 260 290, 380 312"
          fill="none"
          stroke="var(--bad)"
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity="0.5"
        />
        <text x="260" y="324" fontFamily="var(--font-body)" fontSize="10" fill="var(--bad)">
          RMDs force from age 73 · ignored before
        </text>
      </svg>
    </div>
  )
}

export function StrategyStep() {
  const strategy = useStore((s) => s.inputs.withdrawalStrategy)
  const patchInputs = useStore((s) => s.patchInputs)

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 6 }}>Step 5 of 6 · strategy</div>
        <h1>Which account to drain first?</h1>
      </div>

      <p className="muted" style={{ fontSize: 14, marginBottom: 16, maxWidth: 640 }}>
        Each strategy routes withdrawals through your accounts differently. The animation below shows where the next dollar comes from.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <StrategyPill
          active={strategy === WithdrawalStrategy.TaxOptimal}
          title="Tax-optimal"
          sub="taxable → trad → Roth"
          successPct={84}
          delta="baseline"
          onSelect={() => patchInputs({ withdrawalStrategy: WithdrawalStrategy.TaxOptimal })}
        />
        <StrategyPill
          active={strategy === WithdrawalStrategy.Proportional}
          title="Proportional"
          sub="balance-weighted"
          successPct={81}
          delta={-3}
          onSelect={() => patchInputs({ withdrawalStrategy: WithdrawalStrategy.Proportional })}
        />
        <StrategyPill
          active={strategy === WithdrawalStrategy.UserDefined}
          title="User-defined"
          sub="explicit priority list"
          successPct="?"
          delta="–"
          onSelect={() => patchInputs({ withdrawalStrategy: WithdrawalStrategy.UserDefined })}
        />
      </div>

      <MoneyFlowDiagram activeStrategy={strategy} />

      <div
        className="card card-sunk"
        style={{
          padding: 14,
          marginTop: 16,
          display: 'flex',
          gap: 12,
          fontSize: 12,
          color: 'var(--ink-2)',
          alignItems: 'flex-start',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ flex: 'none', marginTop: 1 }} aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--ink-3)" strokeWidth="1.2" />
          <path d="M7 4 V 8 M7 9.6 V 10" stroke="var(--ink-3)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <div>
          <b style={{ color: 'var(--ink)', fontWeight: 500 }}>Roth conversions not modeled (deferred to v2).</b>{' '}
          RMDs from traditional are automatic from age 73 regardless of strategy.
        </div>
      </div>
    </div>
  )
}
