// Threadwell — retirement plot
import { useEffect, useState } from 'react'
import { Frame } from './ui/frame/Frame'
import { UrlParseFailedBanner } from './ui/frame/UrlParseFailedBanner'
import { PersonStep } from './ui/steps/PersonStep'
import { AccountsStep } from './ui/steps/AccountsStep'
import { MarketsStep } from './ui/steps/MarketsStep'
import { ExpensesStep } from './ui/steps/ExpensesStep'
import { StrategyStep } from './ui/steps/StrategyStep'
import { ResultsStep } from './ui/results/ResultsStep'
import { MainScreen } from './ui/v2/MainScreen'
import { GuidedFirstRun } from './ui/v2/GuidedFirstRun'
import { useStore } from './store'
import { useUrlSync } from './hooks/useUrlSync'

const STEPS = [
  PersonStep,
  AccountsStep,
  MarketsStep,
  ExpensesStep,
  StrategyStep,
  ResultsStep,
]

export default function App() {
  const activeStep = useStore((s) => s.ui.activeStep)
  const inputs = useStore((s) => s.inputs)
  const setInputs = useStore((s) => s.setInputs)
  const aesthetic = useStore((s) => s.ui.aesthetic)
  const theme = useStore((s) => s.ui.theme)
  const density = useStore((s) => s.ui.density)
  const setAesthetic = useStore((s) => s.setAesthetic)
  const setTheme = useStore((s) => s.setTheme)
  const setDensity = useStore((s) => s.setDensity)
  const setLastCommittedAt = useStore((s) => s.setLastCommittedAt)
  const { initialInputs, initialUiPrefs, inputsParseFailed, syncToUrl } = useUrlSync()
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Restore inputs + UI prefs from URL on first load. initialInputs/initialUiPrefs
  // are derived once at mount and never change; setters are stable Zustand actions.
  useEffect(() => {
    if (initialInputs) setInputs(initialInputs)
    if (initialUiPrefs) {
      setAesthetic(initialUiPrefs.aesthetic)
      setTheme(initialUiPrefs.theme)
      setDensity(initialUiPrefs.density)
    }
  }, [initialInputs, initialUiPrefs, setInputs, setAesthetic, setTheme, setDensity])

  // Sync inputs + UI prefs to URL whenever any change. The `onCommit` callback
  // records when the debounced write lands, driving "auto-saved Ns ago".
  useEffect(() => {
    syncToUrl(
      inputs,
      { aesthetic, theme, density },
      () => setLastCommittedAt(Date.now()),
    )
  }, [inputs, aesthetic, theme, density, syncToUrl, setLastCommittedAt])

  const StepComponent = STEPS[activeStep] ?? PersonStep
  const isResults = activeStep === 5

  // The v2 single live screen is the default; the legacy 6-step wizard is kept
  // reachable via ?v1=1. Captured once at mount: the URL-sync effect rewrites the
  // query (?s=/?ui=) and would otherwise strip the flag.
  const [legacy] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('v1') === '1',
  )

  // Mobile vs. desktop chrome is handled by CSS media queries inside Frame —
  // both chromes live in the DOM and the browser picks the right one at the
  // 768px breakpoint. No JS resize listener, no remount on rotation.
  return (
    <>
      <UrlParseFailedBanner
        visible={inputsParseFailed && !bannerDismissed}
        onDismiss={() => setBannerDismissed(true)}
      />
      {!legacy ? (
        <div className="hf" data-aesthetic={aesthetic} data-theme={theme} data-density={density} style={{ height: '100%' }}>
          {inputs.accounts.length === 0 && !(initialInputs && initialInputs.accounts.length > 0) ? (
            <GuidedFirstRun onComplete={setInputs} />
          ) : (
            <MainScreen />
          )}
        </div>
      ) : (
        <Frame wide={isResults}>
          <StepComponent />
        </Frame>
      )}
    </>
  )
}
