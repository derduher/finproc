import { TopBar } from './TopBar'
import { StepRail } from './StepRail'
import { useStore } from '../../store'

interface FrameProps {
  children: React.ReactNode
  wide?: boolean
}

export function Frame({ children, wide }: FrameProps) {
  const activeStep = useStore((s) => s.ui.activeStep)
  const setActiveStep = useStore((s) => s.setActiveStep)

  return (
    <div className="hf" data-aesthetic="warm" data-theme="light"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <TopBar />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {!wide && <StepRail />}

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
            {children}
          </div>

          {/* Nav footer */}
          <div style={{
            height: 56,
            borderTop: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            gap: 12,
            background: 'var(--bg-elev)',
            flexShrink: 0,
          }}>
            {activeStep > 0 && (
              <button className="btn btn-ghost" onClick={() => setActiveStep(activeStep - 1)}>
                ← Back
              </button>
            )}
            <div style={{ flex: 1 }} />
            {activeStep < 5 && (
              <button className="btn btn-primary" onClick={() => setActiveStep(activeStep + 1)}>
                {activeStep === 4 ? 'Run projection →' : 'Continue →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
