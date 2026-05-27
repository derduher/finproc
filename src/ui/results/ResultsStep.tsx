import { useSimulation } from '../../hooks/useSimulation'
import { useScenarios } from '../../hooks/useScenarios'
import { runSensitivity } from '../../sim/sensitivity'
import { computeInsights } from '../../sim/insights'
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
  const { saveScenario } = useScenarios()

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

  const sensitivity = runSensitivity(inputs, 100)
  // Insights use the raw (nominal) result so insight numerics aren't mode-dependent.
  const insights = computeInsights(inputs, rawResult, { runCount: 100 })

  const successRateValid = Number.isFinite(result.successRate)
  const successPct = successRateValid ? Math.round(result.successRate * 100) : null
  const isGood = successRateValid && result.successRate >= 0.8
  const isWarn = successRateValid && result.successRate >= 0.5 && result.successRate < 0.8
  const successColor = isGood ? 'var(--good)' : isWarn ? 'var(--accent)' : 'var(--bad)'

  const accounts = inputs.accounts
  const retireAge =
    accounts.length > 0
      ? Math.max(...accounts.map((a) => a.contributionEndAge))
      : inputs.person.currentAge
  const ssAge = inputs.socialSecurity?.claimAge

  // Depletion marker: show when >10% of runs depleted and we have a median depletion age
  const depleted = result.medianDepleteAge !== undefined && result.successRate < 0.9

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
            {result.medianDepleteAge
              ? `Earliest failure: age ${inputs.person.currentAge + 1}`
              : 'No depletion in any run'}
          </div>
        </div>
      </div>

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
        </div>
        <div style={{ overflowX: 'auto' }}>
          <HiFanChart
            result={result}
            retireAge={retireAge}
            depleted={depleted}
            depleteAge={result.medianDepleteAge}
            width={1100}
            height={320}
          />
        </div>
      </div>

      {/* ── Cashflow + sensitivity ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 18,
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
          <HiTornado data={sensitivity} width={400} />
        </div>
      </div>

      {/* ── Insight cards ── */}
      {insights.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(insights.length, 3)}, 1fr)`,
            gap: 18,
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

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const json = JSON.stringify(inputs, null, 2)
              navigator.clipboard?.writeText(json).catch(() => {})
            }}
          >
            Copy as JSON
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href).catch(() => {})
            }}
          >
            Share link
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => saveScenario(inputs.scenarioName + ' (branch)', inputs)}
          >
            ＋ Branch scenario
          </button>
        </div>
      </div>
    </div>
  )
}
