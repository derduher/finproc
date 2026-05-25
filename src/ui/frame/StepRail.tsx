import { useStore } from '../../store'

const STEPS = [
  { label: 'You', sub: 'Age & income' },
  { label: 'Accounts', sub: 'Savings & investments' },
  { label: 'Markets', sub: 'Growth assumptions' },
  { label: 'Expenses', sub: 'Spending & events' },
  { label: 'Strategy', sub: 'Withdrawal order' },
  { label: 'Results', sub: 'Projection' },
]

export function StepRail() {
  const activeStep = useStore((s) => s.ui.activeStep)
  const setActiveStep = useStore((s) => s.setActiveStep)

  return (
    <nav
      aria-label="Wizard steps"
      style={{
        width: 224,
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 8px',
        gap: 2,
        flexShrink: 0,
        background: 'var(--bg)',
      }}
    >
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {STEPS.map((step, i) => {
          const done = i < activeStep
          const active = i === activeStep
          return (
            <li key={i}>
              <button
                className={`nav-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}
                aria-current={active ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${step.label} — ${step.sub}${done ? ' (completed)' : ''}`}
                onClick={() => setActiveStep(i)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <div className="idx" aria-hidden="true">{done ? '✓' : i + 1}</div>
                <div>
                  <div style={{ fontSize: 13, lineHeight: 1.2 }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 1 }}>{step.sub}</div>
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Sim info footer */}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line)', marginTop: 8 }}>
        <div className="micro" style={{ lineHeight: 1.6 }}>
          1,000 Monte Carlo runs<br />
          Seeded · Reproducible
        </div>
      </div>
    </nav>
  )
}
