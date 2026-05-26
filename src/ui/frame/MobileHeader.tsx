/**
 * MobileHeader — the 52px top bar shown only on narrow viewports.
 *
 * Hidden on desktop via the `.shell-mobile-only` CSS class (paired with
 * `.shell-desktop-only` on the desktop TopBar). Both elements live in the
 * DOM at all times so the browser handles the breakpoint natively without
 * any JS resize listener — see "responsive shell" in the plan.
 */
import { useStore } from '../../store'

const STEP_TITLES = ['You', 'Accounts', 'Markets', 'Expenses', 'Strategy', 'Results']

export function MobileHeader() {
  const activeStep = useStore((s) => s.ui.activeStep)
  const setActiveStep = useStore((s) => s.setActiveStep)
  const total = STEP_TITLES.length

  return (
    <header
      aria-label="Mobile wizard nav"
      className="shell-mobile-only"
      style={{
        // display is owned by `.shell-mobile-only` / its @media rule so the
        // CSS class can hide this element on desktop without losing to an
        // inline style.
        height: 52,
        borderBottom: '1px solid var(--line)',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        background: 'var(--bg-elev)',
        flexShrink: 0,
      }}
    >
      {activeStep > 0 ? (
        <button
          type="button"
          data-action="back"
          aria-label="Back"
          className="btn btn-sm btn-icon btn-ghost"
          onClick={() => setActiveStep(activeStep - 1)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M9 3 L 4 7 L 9 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <div style={{ width: 32 }} aria-hidden="true" />
      )}

      <div style={{ flex: 1, textAlign: 'center', lineHeight: 1.15 }}>
        <div className="micro" style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Step {activeStep + 1} of {total}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--ink)' }}>
          {STEP_TITLES[activeStep]}
        </div>
      </div>

      {activeStep < total - 1 ? (
        <button
          type="button"
          data-action="next"
          aria-label="Next"
          className="btn btn-sm btn-primary"
          onClick={() => setActiveStep(activeStep + 1)}
        >
          Next →
        </button>
      ) : (
        <div style={{ width: 32 }} aria-hidden="true" />
      )}
    </header>
  )
}
