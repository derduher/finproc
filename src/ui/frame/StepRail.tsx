import { useStore } from '../../store'

const STEPS = [
  { label: 'You', sub: 'age, salary, taxes' },
  { label: 'Accounts', sub: 'balances, contribs' },
  { label: 'Markets', sub: 'growth & inflation' },
  { label: 'Expenses', sub: 'annual + one-time' },
  { label: 'Strategy', sub: 'withdrawal order' },
  { label: 'Results', sub: 'projection' },
]

function seedHex(seed: number): string {
  const positive = seed < 0 ? seed >>> 0 : seed
  return '0x' + positive.toString(16).padStart(4, '0').slice(-4)
}

export function StepRail() {
  const activeStep = useStore((s) => s.ui.activeStep)
  const setActiveStep = useStore((s) => s.setActiveStep)
  const seed = useStore((s) => s.inputs.seed)

  return (
    <nav
      aria-label="Wizard steps"
      className="shell-desktop-only"
      style={{
        // display owned by .shell-desktop-only (see styles.css).
        width: 240,
        borderRight: '1px solid var(--line)',
        flexDirection: 'column',
        padding: '20px 12px',
        gap: 2,
        flexShrink: 0,
        background: 'var(--bg)',
      }}
    >
      <div className="label" style={{ padding: '4px 12px 8px' }}>plan setup</div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                <div className="idx" aria-hidden="true">
                  {done ? (
                    <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5 L4.5 7 L8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontSize: 13 }}>{step.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{step.sub}</span>
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      <div style={{ flex: 1 }} />
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line)', marginTop: 8 }}>
        <div className="label" style={{ marginBottom: 4 }}>simulation</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
          <span className="num">1,000</span> runs · monte carlo
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
          seed <span className="num">{seedHex(seed)}</span>
        </div>
      </div>
    </nav>
  )
}
