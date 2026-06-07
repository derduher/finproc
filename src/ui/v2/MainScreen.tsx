/**
 * MainScreen — the v2 single live editorial surface (docs/methodology-review.md).
 * Leads with what you can spend and what could go wrong, not a success %:
 * sustainable-spend hero, the spaghetti futures chart, a two-sided risk/surplus
 * read, the spending-policy toggle, and bias-tagged assumptions. Every lever edits
 * the store in place; the simulation re-runs through the worker + cache.
 */
import { useState } from 'react'
import { useStore } from '../../store'
import { useSimulation } from '../../hooks/useSimulation'
import { useSustainableSpend } from '../../hooks/useSustainableSpend'
import { useEarliestRetirementAge } from '../../hooks/useEarliestRetirementAge'
import { useRequiredExtraSavings } from '../../hooks/useRequiredExtraSavings'
import { deflateResult } from '../../sim/displayMode'
import { deriveOutcomeReads } from '../../sim/outcome'
import { formatMoneyAbbreviated as fmt } from '../../math'
import { TopBar2 } from './TopBar2'
import { CoreLevers, totalSaved } from './CoreLevers'
import { SustainableHero, RiskRead, SurplusRead, HoldChip, EarliestRetireRead, SaveMoreRead } from './Outcomes'
import { AssumptionBar, ModeToggle, DollarModeToggle } from './Assumptions'
import { PathsChart, type PathExpenseMarker } from '../charts/PathsChart'
import { GuardrailTimeline } from '../charts/GuardrailTimeline'
import { AdvancedDrawer } from './AdvancedDrawer'
import { MethodologyDrawer } from './MethodologyDrawer'
import { DisclaimerBanner } from './DisclaimerBanner'
import { PathStories } from './PathStories'
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
  const [drawer, setDrawer] = useState<null | 'advanced' | 'methodology'>(null)

  const { result: rawResult, loading } = useSimulation(inputs)
  const { spend } = useSustainableSpend(inputs)
  const { age: earliestAge, loading: solvingAge } = useEarliestRetirementAge(inputs)
  // Only solve "save more" when the target spend exceeds what's sustainable.
  const underfunded = spend != null && inputs.annualExpenses > spend
  const { extraMonthly, loading: solvingSave } = useRequiredExtraSavings(inputs, underfunded)

  const CHART_W = 1320
  const guardrails = inputs.spendingPolicy === 'guardrails'

  return (
    <div className="hf" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <DisclaimerBanner />
      <TopBar2 onAdvanced={() => setDrawer('advanced')} />
      <div className="v2-screen" style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: CHART_W, margin: '0 auto' }}>
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
              })
              const median = result.yearlyResults.map((y) => y.p50)
              const expenses: PathExpenseMarker[] = inputs.oneTimeExpenses.map((e) => ({
                age: e.age,
                amount: e.amountPresentDollars,
                label: e.label,
              }))
              const rep = guardrails ? representativePath(result) : undefined

              return (
                <>
                  {/* hero + levers */}
                  <div className="v2-hero-grid">
                    {spend == null ? (
                      <div>
                        <div className="label" style={{ marginBottom: 8 }}>spending you can sustain</div>
                        <div className="hero-spend" style={{ fontSize: 76, color: 'var(--ink-3)' }}>…</div>
                        <div className="micro" style={{ marginTop: 8 }}>solving for your sustainable spend…</div>
                      </div>
                    ) : (
                      <div>
                        <SustainableHero reads={reads} />
                        <EarliestRetireRead
                          age={earliestAge}
                          planRetireAge={inputs.person.retirementAge}
                          targetSpend={target}
                          maxAge={inputs.person.maxAge}
                          loading={solvingAge}
                        />
                        {underfunded && (
                          <SaveMoreRead
                            extraMonthly={extraMonthly}
                            loading={solvingSave}
                            targetSpend={target}
                            planRetireAge={inputs.person.retirementAge}
                          />
                        )}
                      </div>
                    )}
                    <div style={{ paddingTop: 8 }}>
                      <div className="label" style={{ marginBottom: 12 }}>your levers · edit anything</div>
                      <CoreLevers />
                    </div>
                  </div>

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
                  </div>

                  {/* two-sided outcome */}
                  <div className="v2-outcome-grid">
                    <RiskRead reads={reads} />
                    <SurplusRead reads={reads} />
                  </div>

                  {/* year-by-year path narratives */}
                  <div style={{ marginTop: 18 }}>
                    <PathStories
                      result={result}
                      currentAge={inputs.person.currentAge}
                      retireAge={inputs.person.retirementAge}
                    />
                  </div>

                  {/* demoted success + assumptions */}
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
