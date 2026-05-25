import { useStore } from '../../store'
import { WithdrawalStrategy } from '../../schema'

const STRATEGIES = [
  {
    value: WithdrawalStrategy.TaxOptimal,
    label: 'Tax-optimal',
    desc: 'Draw taxable → traditional → Roth. Minimises lifetime tax drag.',
  },
  {
    value: WithdrawalStrategy.Proportional,
    label: 'Proportional',
    desc: 'Draw from all accounts in proportion to their balance each year.',
  },
  {
    value: WithdrawalStrategy.UserDefined,
    label: 'Custom order',
    desc: 'You choose the exact withdrawal sequence.',
  },
]

export function StrategyStep() {
  const strategy = useStore((s) => s.inputs.withdrawalStrategy)
  const patchInputs = useStore((s) => s.patchInputs)

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ marginBottom: 4 }}>Withdrawal strategy</h2>
      <p className="muted" style={{ marginBottom: 24, fontSize: 13 }}>
        How should funds be drawn from your accounts in retirement?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STRATEGIES.map((s) => {
          const active = strategy === s.value
          return (
            <div
              key={s.value}
              className="card"
              onClick={() => patchInputs({ withdrawalStrategy: s.value })}
              style={{
                cursor: 'pointer',
                borderColor: active ? 'var(--accent)' : 'var(--line)',
                background: active ? 'var(--accent-soft)' : 'var(--bg-elev)',
                transition: 'all .12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--line-strong)'}`,
                  background: active ? 'var(--accent)' : 'transparent',
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{s.label}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{s.desc}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Animated money flow SVG */}
      <div className="card" style={{ marginTop: 24, padding: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>Account flow</div>
        <svg width="100%" height="60" viewBox="0 0 400 60">
          {/* Taxable → Traditional → Roth */}
          <rect x="0" y="16" width="90" height="28" rx="6" fill="var(--bg-sunk)" stroke="var(--line)" />
          <text x="45" y="33" textAnchor="middle" fill="var(--ink-3)" fontSize="11" fontFamily="var(--font-body)">Taxable</text>

          <line x1="90" y1="30" x2="150" y2="30" stroke="var(--accent)" strokeWidth="1.5" className="flow-dash" />
          <polygon points="150,26 158,30 150,34" fill="var(--accent)" />

          <rect x="158" y="16" width="90" height="28" rx="6" fill="var(--bg-sunk)" stroke="var(--line)" />
          <text x="203" y="33" textAnchor="middle" fill="var(--ink-3)" fontSize="11" fontFamily="var(--font-body)">Traditional</text>

          <line x1="248" y1="30" x2="308" y2="30" stroke="var(--accent)" strokeWidth="1.5" className="flow-dash" />
          <polygon points="308,26 316,30 308,34" fill="var(--accent)" />

          <rect x="316" y="16" width="80" height="28" rx="6" fill="var(--bg-sunk)" stroke="var(--line)" />
          <text x="356" y="33" textAnchor="middle" fill="var(--ink-3)" fontSize="11" fontFamily="var(--font-body)">Roth</text>
        </svg>
      </div>
    </div>
  )
}
