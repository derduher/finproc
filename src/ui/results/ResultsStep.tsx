import { useState } from 'react'
import { useSimulation } from '../../hooks/useSimulation'
import { useScenarios } from '../../hooks/useScenarios'
import { runSensitivity } from '../../sim/sensitivity'
import { computeInsights } from '../../sim/insights'
import { findRetirementAgeForSuccess } from '../../sim/retirementSolver'
import type { RetirementSolveResult } from '../../sim/retirementSolver'
import { useStore } from '../../store'
import { formatMoneyAbbreviated } from '../../math'
import { deflateResult } from '../../sim/displayMode'
import { HiFanChart } from '../charts/HiFanChart'
import { HiTornado } from '../charts/HiTornado'
import { HiCashflow } from '../charts/HiCashflow'
import { InsightCard } from './InsightCard'
import { LoadingState, StaleBadge } from '../loading/LoadingState'

function seedHex(seed: number): string {
  return `0x${(seed >>> 0).toString(16).padStart(8, '0').slice(0, 4)}`
}

export function ResultsStep() {
  const inputs = useStore((s) => s.inputs)
  const displayMode = useStore((s) => s.ui.displayMode)
  const setActiveStep = useStore((s) => s.setActiveStep)
  const { result: rawResult, loading, stale, progress } = useSimulation(inputs)
  const { scenarios, saveScenario } = useScenarios()
  const [shareCopied, setShareCopied] = useState(false)
  const [jsonCopied, setJsonCopied] = useState(false)
  const [branchSaved, setBranchSaved] = useState(false)
  const [hideP90, setHideP90] = useState(false)
  const [targetPct, setTargetPct] = useState(90)
  // undefined = not run yet; null = no age reaches the target; otherwise the result.
  const [solveResult, setSolveResult] = useState<RetirementSolveResult | null | undefined>(undefined)

  if (loading || !rawResult) {
    return (
      <LoadingState
        progress={progress}
        onCancel={() => setActiveStep(4)}
        seedHex={seedHex(inputs.seed)}
      />
    )
  }

  // Apply nominal/real deflation once; downstream charts + metric cards stay agnostic.
  const result = deflateResult(rawResult, displayMode, inputs)
  const isReal = displayMode === 'real'

  // Sensitivity deltas are common-random-number paired (base vs perturbed share a
  // seed), so they're stable at a modest run count.
  const sensitivity = runSensitivity(inputs, 200)
  // Insights diff against the worker's full 1,000-run baseline, so the rules run at
  // the same resolution for a paired comparison and gate each delta on significance
  // (bug #6 — at 100 runs the ~6pp seed noise swamped the ~2–7pp effects reported).
  // These are memoized by the React Compiler, so they recompute only on input change.
  const insights = computeInsights(inputs, rawResult)

  const successRateValid = Number.isFinite(result.successRate)
  const successPct = successRateValid ? Math.round(result.successRate * 100) : null
  const isGood = successRateValid && result.successRate >= 0.8
  const isWarn = successRateValid && result.successRate >= 0.5 && result.successRate < 0.8
  const successColor = isGood ? 'var(--good)' : isWarn ? 'var(--accent)' : 'var(--bad)'

  // Retire marker on the fan chart is the user's explicit retirement age,
  // not max(account.contributionEndAge) — that derived form went wrong any
  // time an account had a stale contributionEndAge with zero contribution.
  const retireAge = inputs.person.retirementAge
  const ssAge = inputs.socialSecurity?.claimAge

  // Depletion marker: show when >10% of runs depleted and we have a median depletion age
  const depleted = result.medianDepleteAge !== undefined && result.successRate < 0.9

  // First age where the P10 portfolio path hits zero (matches what the user
  // sees in the fan chart). Undefined when P10 stays positive through maxAge.
  const p10DepleteAge = result.yearlyResults.find((r) => r.p10 <= 0)?.age

  const handleSolve = () => {
    const target = Math.min(100, Math.max(1, targetPct)) / 100
    const r = findRetirementAgeForSuccess(inputs, target, { runCount: 200 })
    setSolveResult(r ?? null)
  }

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Eyebrow + heading */}
      <div>
        <div className="label" style={{ marginBottom: 6 }}>Step 6 of 6 · results</div>
        <h2 style={{ margin: 0 }}>Your retirement projection</h2>
        {stale && (
          <div style={{ display: 'inline-flex', marginTop: 8 }}>
            <StaleBadge />
          </div>
        )}
      </div>

      {/* ── Headline metrics ──
          Layout (grid + columns + gap) is in styles.css under [data-metrics-grid]
          so it can be overridden at the 768px breakpoint without re-rendering.
          Inline styles here only carry dynamic state. */}
      <div
        data-metrics-grid
        style={{
          opacity: stale ? 0.6 : 1,
          transition: 'opacity .3s',
        }}
      >
        {/* Success rate card */}
        <div className="card" style={{ padding: 20, background: 'var(--bg-elev)', position: 'relative' }}>
          <div className="label">success rate</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 64,
                lineHeight: 1,
                color: successColor,
                letterSpacing: '-0.02em',
              }}
            >
              {successPct ?? '—'}
            </span>
            <span style={{ fontSize: 24, color: 'var(--ink-3)' }}>%</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 6 }}>
            of <span className="num">1,000</span> Monte Carlo runs end with money to spare at age{' '}
            <span className="num">{inputs.person.maxAge}</span>.
          </div>
          <div style={{ marginTop: 12, height: 6, background: 'var(--bg-sunk)', borderRadius: 3, overflow: 'hidden' }}>
            <div
              data-testid="success-bar"
              style={{
                width: `${successPct ?? 0}%`,
                height: '100%',
                background: successColor,
                borderRadius: 3,
                transition: 'width .4s',
              }}
            />
          </div>
        </div>

        {/* Median ending balance */}
        <div className="card" style={{ padding: 20 }}>
          <div className="label">median ending balance</div>
          <div className="value-mono" style={{ fontSize: 32, marginTop: 4, color: 'var(--ink)' }}>
            {formatMoneyAbbreviated(result.p50EndBalance)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            P50 {isReal ? 'real' : 'nominal'} · age {inputs.person.maxAge}
          </div>
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid var(--line)',
              fontSize: 11,
              color: 'var(--ink-3)',
            }}
          >
            {isReal
              ? "shown in today's dollars"
              : 'nominal — use the seg in the top bar to deflate to today’s $'}
          </div>
        </div>

        {/* P10 ending balance */}
        <div className="card" style={{ padding: 20 }}>
          <div className="label">P10 ending balance</div>
          <div className="value-mono" style={{ fontSize: 32, marginTop: 4, color: 'var(--ink)' }}>
            {formatMoneyAbbreviated(result.p10EndBalance)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            10th-percentile outcome
          </div>
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid var(--line)',
              fontSize: 11,
              color: 'var(--ink-3)',
            }}
          >
            Worse than this in 10% of runs.
          </div>
        </div>

        {/* Depletion age */}
        <div className="card" style={{ padding: 20 }}>
          <div className="label">depletion age</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span
              className="value-mono"
              style={{ fontSize: 32, color: result.medianDepleteAge ? 'var(--bad)' : 'var(--good)' }}
            >
              {result.medianDepleteAge ?? '—'}
            </span>
            {result.medianDepleteAge && (
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>median</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            {result.medianDepleteAge
              ? `among ${Math.round((1 - result.successRate) * 1000)} failing runs`
              : 'all runs survived'}
          </div>
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid var(--line)',
              fontSize: 11,
              color: 'var(--ink-3)',
            }}
          >
            {p10DepleteAge !== undefined
              ? `P10 hits zero at age ${p10DepleteAge}`
              : result.medianDepleteAge
                ? `P10 survives to age ${inputs.person.maxAge}`
                : 'No depletion in any run'}
          </div>
        </div>
      </div>

      {/* Guardrails honesty note: a "success" that survived by cutting spending
          should say so, not hide behind the headline rate. */}
      {inputs.spendingPolicy === 'guardrails' &&
        result.spendFloorP10 !== undefined &&
        result.spendFloorP10 < 1 && (
          <div
            className="card card-sunk"
            role="note"
            style={{ padding: 14, marginBottom: 24, fontSize: 13, color: 'var(--ink-2)' }}
          >
            <b style={{ fontWeight: 500 }}>Guardrails spending floor:</b>{' '}
            in the worst 1-in-10 futures, staying funded meant cutting spending by about{' '}
            <span className="num">{Math.round((1 - result.spendFloorP10) * 100)}%</span> at the
            lowest point. The success rate above counts those trimmed-spending runs as successes.
          </div>
        )}

      {/* ── Fan chart ── */}
      <div
        className="card"
        style={{ padding: 24, opacity: stale ? 0.6 : 1, transition: 'opacity .3s' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 10,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              Portfolio value · current age{' '}
              <span className="num">{inputs.person.currentAge}</span> through{' '}
              <span className="num">{inputs.person.maxAge}</span>
            </h2>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
              P10–P90 band of <span className="num">1,000</span> simulated paths · solid line = median
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              aria-label="Hide 90th percentile"
              checked={hideP90}
              onChange={(e) => setHideP90(e.target.checked)}
            />
            hide P90
          </label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <HiFanChart
            result={result}
            retireAge={retireAge}
            depleted={depleted}
            depleteAge={result.medianDepleteAge}
            hideP90={hideP90}
            width={1100}
            height={320}
          />
        </div>
      </div>

      {/* ── Cashflow + sensitivity ── */}
      <div
        data-cashflow-grid
        style={{
          opacity: stale ? 0.6 : 1,
          transition: 'opacity .3s',
        }}
      >
        {/* Cashflow chart */}
        <div className="card" style={{ padding: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Annual cashflow</h3>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                contributions and Social Security in; withdrawals out.
              </div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <HiCashflow
              data={result.yearlyResults}
              currentAge={inputs.person.currentAge}
              retireAge={retireAge}
              ssAge={ssAge}
              width={660}
              height={200}
            />
          </div>
        </div>

        {/* Sensitivity / tornado */}
        <div className="card" style={{ padding: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Sensitivity · top levers</h3>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                one-at-a-time perturbation, <span className="num">±20%</span>
              </div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <HiTornado data={sensitivity} width={400} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.5 }}>
            How to read: each lever was moved <span className="num">±20%</span> from your baseline.
            Bars to the right mean success rate goes up; bars to the left mean success rate goes
            down. The top row has the largest impact.
          </div>
        </div>
      </div>

      {/* ── Retirement-age solver ── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>When can I retire?</h3>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              Find the earliest retirement age that hits a target success rate.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label htmlFor="solve-target" style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              target
              <input
                id="solve-target"
                aria-label="Target success rate percent"
                type="number"
                className="field field-num"
                style={{ width: 72 }}
                min={1}
                max={100}
                step={1}
                value={targetPct}
                onChange={(e) => setTargetPct(Number(e.target.value))}
              />
              %
            </label>
            <button type="button" className="btn btn-sm btn-primary" onClick={handleSolve}>
              Find age
            </button>
          </div>
        </div>
        {solveResult !== undefined && (
          <div role="status" style={{ fontSize: 14, color: 'var(--ink)', marginTop: 4 }}>
            {solveResult === null ? (
              <span style={{ color: 'var(--bad)' }}>
                No retirement age up to {inputs.person.maxAge} reaches {targetPct}% success with these inputs.
              </span>
            ) : (
              <>
                Retire at age{' '}
                <span className="num" style={{ color: 'var(--good)', fontWeight: 600 }}>{solveResult.age}</span>{' '}
                for ≈ <span className="num">{Math.round(solveResult.successRate * 100)}%</span> success.
                {solveResult.age !== inputs.person.retirementAge && (
                  <span style={{ color: 'var(--ink-3)' }}> (your plan currently retires at {inputs.person.retirementAge})</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Insight cards ── */}
      {insights.length > 0 && (
        <div
          data-insights-grid
          style={{
            gridTemplateColumns: `repeat(${Math.min(insights.length, 3)}, 1fr)`,
          }}
        >
          {insights.map((insight) => (
            <InsightCard
              key={insight.title}
              tone={insight.tone}
              title={insight.title}
              body={insight.body}
              cta={insight.cta}
            />
          ))}
        </div>
      )}

      {/* ── Scenario footer ── */}
      <div
        className="card"
        style={{
          padding: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--ink-2)' }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: 'var(--bg-sunk)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-3)',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M3 7 L 11 7 M 7 3 L 11 7 L 7 11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <div style={{ color: 'var(--ink)' }}>Compare this scenario</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>save up to 4 scenarios and overlay them</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {branchSaved && (
            <span
              role="status"
              style={{ fontSize: 12, color: 'var(--good)' }}
            >
              Scenario saved
            </span>
          )}
          <button
            type="button"
            className="btn btn-sm"
            aria-label="Copy as JSON"
            onClick={() => {
              const json = JSON.stringify(inputs, null, 2)
              navigator.clipboard?.writeText(json).catch(() => {})
              setJsonCopied(true)
              setTimeout(() => setJsonCopied(false), 1800)
            }}
          >
            {jsonCopied ? 'Copied!' : 'Copy as JSON'}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            aria-label="Share link"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href).catch(() => {})
              setShareCopied(true)
              setTimeout(() => setShareCopied(false), 1800)
            }}
          >
            {shareCopied ? 'Copied!' : 'Share link'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={scenarios.length >= 4}
            title={scenarios.length >= 4 ? 'Scenario limit reached (4). Delete one to add more.' : undefined}
            onClick={() => {
              saveScenario(inputs.scenarioName + ' (branch)', inputs)
              setBranchSaved(true)
              setTimeout(() => setBranchSaved(false), 2200)
            }}
          >
            ＋ Branch scenario
          </button>
        </div>
      </div>
    </div>
  )
}
