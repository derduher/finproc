import { useStore } from '../../store'

const STEP_TITLES = ['You', 'Accounts', 'Markets', 'Expenses', 'Strategy', 'Results']

interface Props {
  children: React.ReactNode
}

export function MobileChrome({ children }: Props) {
  const activeStep = useStore((s) => s.ui.activeStep)
  const setActiveStep = useStore((s) => s.setActiveStep)

  return (
    <div className="hf" data-aesthetic="warm" data-theme="light"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {/* Mobile header */}
      <div style={{
        height: 52,
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        background: 'var(--bg-elev)',
        flexShrink: 0,
      }}>
        {activeStep > 0 && (
          <button className="btn-ghost btn-sm" style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setActiveStep(activeStep - 1)}>←</button>
        )}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{STEP_TITLES[activeStep]}</div>
          <div className="micro">{activeStep + 1} of {STEP_TITLES.length}</div>
        </div>
        {activeStep < 5 && (
          <button className="btn btn-sm btn-primary" onClick={() => setActiveStep(activeStep + 1)}>
            Next
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', height: 3, background: 'var(--bg-sunk)' }}>
        <div style={{
          width: `${((activeStep + 1) / STEP_TITLES.length) * 100}%`,
          background: 'var(--accent)',
          transition: 'width .3s',
        }} />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px' }}>
        {children}
      </div>
    </div>
  )
}
