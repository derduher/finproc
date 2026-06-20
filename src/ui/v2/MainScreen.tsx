/**
 * MainScreen — the v2 single live editorial surface (docs/methodology-review.md).
 * Leads with an interactive headline (the Result Explorer: earliest age ⇄ most
 * you can spend, with a confidence lever), then the spaghetti futures chart, a
 * two-sided risk/surplus read, the guardrails bridge, and the deeper analytical
 * sections (path stories, historical stress, sensitivity + insights) and
 * bias-tagged assumptions. Every lever edits the store in place; the simulation
 * re-runs through the worker + cache.
 */
import { useState } from 'react'
import { useStore } from '../../store'
import { useSimulation } from '../../hooks/useSimulation'
import { useContainerWidth } from '../../hooks/useContainerWidth'
import { useSustainableSpend } from '../../hooks/useSustainableSpend'
import { useEarliestRetirementAge } from '../../hooks/useEarliestRetirementAge'
import { deflateResult } from '../../sim/displayMode'
import { deriveOutcomeReads } from '../../sim/outcome'
import { formatMoneyAbbreviated as fmt } from '../../math'
import { TopBar2 } from './TopBar2'
import { totalSaved } from './CoreLevers'
import { RiskRead, SurplusRead, HoldChip, SpendFloorNote, PushNote } from './Outcomes'
import { AssumptionBar, ModeToggle, DollarModeToggle } from './Assumptions'
import { PathsChart, type PathExpenseMarker } from '../charts/PathsChart'
import { GuardrailTimeline } from '../charts/GuardrailTimeline'
import { AdvancedDrawer } from './AdvancedDrawer'
import { MethodologyDrawer } from './MethodologyDrawer'
import { DisclaimerBanner } from './DisclaimerBanner'
import { PathStories } from './PathStories'
import { StressTest } from './StressTest'
import { WhatMoves } from './WhatMoves'
import { ResultExplorer } from './ResultExplorer'
import { useHistoricalStress } from '../../hooks/useHistoricalStress'
import { useSensitivity } from '../../hooks/useSensitivity'
import { useInsights } from '../../hooks/useInsights'
import type { MonteCarloResult } from '../../sim/montecarlo'

/** Sample path whose ending balance is closest to the median — a representative run. */
function representativePath(result: MonteCarloResult) {
  let best: MonteCarloResult['samplePaths'][number] | undefined
  let bestDiff = Infinity
  for (const p of result.samplePaths) {
    const end = p.balances[p.balances.length - 1] ?? 0
    const diff = Math.abs(end - result.p50EndBalance)
    if (diff < bestDiff) {
      bestDiff = diff
      best = p
    }
  }
  return best
}

export function MainScreen() {
  const inputs = useStore((s) => s.inputs)
  const displayMode = useStore((s) => s.ui.displayMode)
  const setDisplayMode = useStore((s) => s.setDisplayMode)
  const patchInputs = useStore((s) => s.patchInputs)
  const confidence = useStore((s) => s.ui.confidenceTarget)
  const setConfidenceTarget = useStore((s) => s.setConfidenceTarget)
  const [drawer, setDrawer] = useState<null | 'advanced' | 'methodology'>(null)
  const [stressId, setStressId] = useState<string | null>(null)

  const { result: rawResult, loading } = useSimulation(inputs)
  // Single solve site, at the explorer's confidence — feeds both the headline
  // (passed into ResultExplorer) and the two-sided reads below.
  const { spend, loading: solvingSpend } = useSustainableSpend(inputs, confidence)
  const { age: earliestAge, loading: solvingAge } = useEarliestRetirementAge(inputs, confidence)

  // Lay the futures chart out to the live content width so it fits any viewport.
  const [contentRef, contentWidth] = useContainerWidth<HTMLDivElement>(1320)
  const MAX_W = 1320
  const CHART_W = Math.max(320, Math.min(MAX_W, contentWidth))
  const guardrails = inputs.spendingPolicy === 'guardrails'
  const stress = useHistoricalStress(inputs, displayMode)
  const { data: sensitivityRows, loading: sensitivityLoading } = useSensitivity(inputs)
  const { data: insightCards, loading: insightsLoading } = useInsights(inputs)

  return (
    <div className="hf" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <DisclaimerBanner />
      <TopBar2 onAdvanced={() => setDrawer('advanced')} />
      <div className="v2-screen" style={{ flex: 1, overflow: 'auto' }}>
        <div ref={contentRef} style={{ maxWidth: MAX_W, margin: '0 auto' }}>
          {!rawResult ? (
            <div style={{ padding: '120px 0', textAlign: 'center', color: 'var(--ink-3)' }}>
              {loading ? 'Projecting one thousand futures…' : 'Add a plan to see your projection.'}
            </div>
          ) : (
            (() => {
              const result = deflateResult(rawResult, displayMode, inputs)
              const target = inputs.annualExpenses
              const reads = deriveOutcomeReads({
                result,
                sustainable: spend ?? target,
                target,
                maxAge: inputs.person.maxAge,
                retireAge: inputs.person.retirementAge,
              })
              const median = result.yearlyResults.map((y) => y.p50)
              const expenses: PathExpenseMarker[] = inputs.oneTimeExpenses.map((e) => ({
                age: e.age,
                amount: e.amountPresentDollars,
                label: e.label,
              }))
              const rep = guardrails ? representativePath(result) : undefined

              // Selected crisis → a bold deterministic overlay on the futures chart.
              const stressView = stress.scenarios.find((s) => s.scenario.id === stressId)
              const stressOverlay = stressView
                ? {
                    label: `if ${stressView.scenario.name} repeated at retirement`,
                    balances: stressView.balances,
                    tone: stressView.survived ? ('accent' as const) : ('bad' as const),
                  }
                : undefined

              return (
                <>
                  {/* interactive headline — earliest age ⇄ most you can spend */}
                  <ResultExplorer
                    confidence={confidence}
                    sustainableSpend={spend}
                    earliestAge={earliestAge}
                    solvingSpend={solvingSpend}
                    solvingAge={solvingAge}
                    onConfidenceChange={setConfidenceTarget}
                    onAdvanced={() => setDrawer('advanced')}
                  />

                  {/* chart */}
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 22, marginBottom: 18 }}>
                    <div className="v2-chart-head">
                      <div>
                        <h2 style={{ margin: 0 }}>One thousand possible futures</h2>
                        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                          Each thin line is one market history. Returns vary year to year, so the order of good and bad years matters.
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                        <DollarModeToggle mode={displayMode} onChange={setDisplayMode} />
                        <ModeToggle
                          mode={guardrails ? 'guardrails' : 'flat'}
                          onChange={(m) => patchInputs({ spendingPolicy: m })}
                        />
                      </div>
                    </div>
                    <PathsChart
                      samplePaths={result.samplePaths}
                      median={median}
                      currentAge={inputs.person.currentAge}
                      retireAge={inputs.person.retirementAge}
                      maxAge={inputs.person.maxAge}
                      startBalance={totalSaved(inputs)}
                      ssAge={inputs.socialSecurity?.claimAge}
                      expenses={expenses}
                      overlay={stressOverlay}
                      width={CHART_W}
                      height={356}
                      holdLabel={`~${Math.round(reads.holdRate * 100)}% of 1,000 runs hold your ${fmt(target)} target`}
                    />
                    {rep && (rep.cutYears.length > 0 || rep.raiseYears.length > 0) && (
                      <GuardrailTimeline
                        cutYears={rep.cutYears}
                        raiseYears={rep.raiseYears}
                        currentAge={inputs.person.currentAge}
                        maxAge={inputs.person.maxAge}
                        width={CHART_W}
                      />
                    )}
                    <SpendFloorNote guardrails={guardrails} spendFloorP10={rawResult.spendFloorP10} />
                  </div>

                  {/* two-sided outcome */}
                  <div className="v2-outcome-grid">
                    <RiskRead reads={reads} />
                    <SurplusRead reads={reads} />
                  </div>

                  {/* bridge: the cost of spending the full sustainable amount */}
                  <div style={{ marginBottom: 22 }}>
                    <PushNote reads={reads} />
                  </div>

                  {/* year-by-year path narratives */}
                  <div style={{ marginTop: 18 }}>
                    <PathStories
                      result={result}
                      currentAge={inputs.person.currentAge}
                      retireAge={inputs.person.retirementAge}
                    />
                  </div>

                  {/* historical stress test */}
                  <div style={{ marginTop: 18 }}>
                    <StressTest stress={stress} selectedId={stressId} onSelect={setStressId} />
                  </div>

                  {/* sensitivity tornado + insight cards */}
                  <div style={{ marginTop: 18 }}>
                    <WhatMoves
                      sensitivity={sensitivityRows}
                      insights={insightCards}
                      loading={sensitivityLoading || insightsLoading}
                    />
                  </div>

                  {/* demoted success + assumptions */}
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18, marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <HoldChip reads={reads} />
                    <AssumptionBar maxAge={inputs.person.maxAge} longevity={inputs.longevity ?? 'fixed'} onMethodology={() => setDrawer('methodology')} />
                  </div>
                </>
              )
            })()
          )}
        </div>
      </div>

      {drawer === 'advanced' && <AdvancedDrawer onClose={() => setDrawer(null)} />}
      {drawer === 'methodology' && <MethodologyDrawer onClose={() => setDrawer(null)} />}
    </div>
  )
}
