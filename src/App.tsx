// Threadwell — retirement plot
import { useEffect, useState } from 'react'
import { UrlParseFailedBanner } from './ui/frame/UrlParseFailedBanner'
import { MainScreen } from './ui/v2/MainScreen'
import { GuidedFirstRun } from './ui/v2/GuidedFirstRun'
import { useStore } from './store'
import { useUrlSync } from './hooks/useUrlSync'

export default function App() {
  const inputs = useStore((s) => s.inputs)
  const setInputs = useStore((s) => s.setInputs)
  const startFirstRun = useStore((s) => s.startFirstRun)
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

  // Mirror the active theme onto <html> so the document background (and the
  // iOS/iPad overscroll "rubber-band" area) resolves the themed --bg instead of
  // an unthemed white band (#5). The token selectors ([data-aesthetic]) are global.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-aesthetic', aesthetic)
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-density', density)
  }, [aesthetic, theme, density])

  // Sync inputs + UI prefs to URL whenever any change. The `onCommit` callback
  // records when the debounced write lands, driving "auto-saved Ns ago".
  useEffect(() => {
    syncToUrl(
      inputs,
      { aesthetic, theme, density },
      () => setLastCommittedAt(Date.now()),
    )
  }, [inputs, aesthetic, theme, density, syncToUrl, setLastCommittedAt])

  return (
    <>
      <UrlParseFailedBanner
        visible={inputsParseFailed && !bannerDismissed}
        onDismiss={() => setBannerDismissed(true)}
      />
      <div className="hf" data-aesthetic={aesthetic} data-theme={theme} data-density={density} style={{ height: '100%' }}>
        {inputs.accounts.length === 0 && !(initialInputs && initialInputs.accounts.length > 0) ? (
          <GuidedFirstRun
            onComplete={(next) => {
              setInputs(next)
              // Land on the rough/range result with the guess-check active. This
              // only fires when the plan is built here, not when restoring a URL.
              startFirstRun()
            }}
          />
        ) : (
          <MainScreen />
        )}
      </div>
    </>
  )
}
