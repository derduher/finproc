// Threadwell — retirement plot
import { useEffect } from 'react'
import { Frame } from './ui/frame/Frame'
import { MobileChrome } from './ui/mobile/MobileChrome'
import { PersonStep } from './ui/steps/PersonStep'
import { AccountsStep } from './ui/steps/AccountsStep'
import { MarketsStep } from './ui/steps/MarketsStep'
import { ExpensesStep } from './ui/steps/ExpensesStep'
import { StrategyStep } from './ui/steps/StrategyStep'
import { ResultsStep } from './ui/results/ResultsStep'
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
  const { initialInputs, syncToUrl } = useUrlSync()

  // Restore from URL on first load.
  // initialInputs is derived once from the URL at mount and never changes.
  // setInputs is a stable Zustand action. This effect runs exactly once.
  useEffect(() => {
    if (initialInputs) setInputs(initialInputs)
  }, [initialInputs, setInputs])

  // Sync to URL whenever inputs change
  useEffect(() => {
    syncToUrl(inputs)
  }, [inputs, syncToUrl])

  const StepComponent = STEPS[activeStep] ?? PersonStep
  const isResults = activeStep === 5
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  if (isMobile) {
    return (
      <MobileChrome>
        <StepComponent />
      </MobileChrome>
    )
  }

  return (
    <Frame wide={isResults}>
      <StepComponent />
    </Frame>
  )
}
