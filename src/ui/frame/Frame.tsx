import { TopBar } from './TopBar'
import { StepRail } from './StepRail'
import { PreviewRail } from './PreviewRail'
import { MobileHeader } from './MobileHeader'
import { useStore } from '../../store'
import { useScenarios } from '../../hooks/useScenarios'

interface FrameProps {
  children: React.ReactNode
  /** Results step (or any step that wants to use the full canvas) */
  wide?: boolean
}

const LAST_STEP = 5

export function Frame({ children, wide }: FrameProps) {
  const activeStep = useStore((s) => s.ui.activeStep)
  const setActiveStep = useStore((s) => s.setActiveStep)
  const inputs = useStore((s) => s.inputs)
  const aesthetic = useStore((s) => s.ui.aesthetic)
  const theme = useStore((s) => s.ui.theme)
  const density = useStore((s) => s.ui.density)
  const { saveScenario } = useScenarios()

  const isResults = activeStep === LAST_STEP

  return (
    <div
      className="hf"
      data-aesthetic={aesthetic}
      data-theme={theme}
      data-density={density}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {/* Both top chromes live in the tree; CSS picks one at the breakpoint. */}
      <TopBar />
      <MobileHeader />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {!wide && <StepRail />}

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '28px 36px' }}>
            {children}
          </div>

          {/* Desktop footer — hidden on mobile, where MobileHeader's Next handles forward nav. */}
          <div
            aria-label="Desktop wizard footer"
            className="shell-desktop-only"
            style={{
              // display owned by .shell-desktop-only (see styles.css).
              minHeight: 56,
              borderTop: '1px solid var(--line)',
              alignItems: 'center',
              padding: '12px 24px',
              gap: 8,
              background: 'var(--bg-elev)',
              flexShrink: 0,
              justifyContent: 'space-between',
            }}
          >
            <div>
              {isResults ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setActiveStep(LAST_STEP - 1)}
                >
                  ← Edit strategy
                </button>
              ) : activeStep > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setActiveStep(activeStep - 1)}
                >
                  ← Back
                </button>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {isResults ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => saveScenario(inputs.scenarioName, inputs)}
                >
                  Save scenario
                </button>
              ) : (
                <>
                  {activeStep > 0 && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setActiveStep(0)}
                    >
                      Save & exit
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActiveStep(activeStep + 1)}
                  >
                    {activeStep === 4 ? 'Run projection →' : 'Continue →'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {!wide && <PreviewRail />}
      </div>
    </div>
  )
}
