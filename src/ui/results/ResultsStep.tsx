import { useSimulation } from '../../hooks/useSimulation'
import { runSensitivity } from '../../sim/sensitivity'
import { useStore } from '../../store'
import { formatMoneyAbbreviated } from '../../math'
import { HiFanChart } from '../charts/HiFanChart'
import { HiTornado } from '../charts/HiTornado'
import { LoadingState, StaleBadge } from '../loading/LoadingState'

export function ResultsStep() {
  const inputs = useStore((s) => s.inputs)
  const { result, loading, stale } = useSimulation(inputs)

  if (loading || !result) {
    return <LoadingState />
  }

  const sensitivity = runSensitivity(inputs, 100)
  const successPct = (result.successRate * 100).toFixed(0)
  const isGood = result.successRate >= 0.8
  const isWarn = result.successRate >= 0.5 && result.successRate < 0.8

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Stale indicator — shown while recomputing after an input change */}
      {stale && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <StaleBadge />
        </div>
      )}

      {/* Headline metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 28,
          opacity: stale ? 0.6 : 1,
          transition: 'opacity .3s',
        }}
      >
        {/* Success rate */}
        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>Success rate</div>
          <div className="metric">
            <div className="value" style={{
              color: isGood ? 'var(--good)' : isWarn ? 'var(--accent)' : 'var(--bad)',
            }}>
              {successPct}%
            </div>
          </div>
          <div style={{ height: 4, background: 'var(--bg-sunk)', borderRadius: 2, marginTop: 10 }}>
            <div style={{
              height: '100%',
              width: `${successPct}%`,
              background: isGood ? 'var(--good)' : isWarn ? 'var(--accent)' : 'var(--bad)',
              borderRadius: 2,
              transition: 'width .4s',
            }} />
          </div>
          <div className="micro" style={{ marginTop: 6 }}>of 1,000 runs</div>
        </div>

        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>Median end balance</div>
          <div className="metric">
            <div className="value-mono num">{formatMoneyAbbreviated(result.p50EndBalance)}</div>
          </div>
          <div className="micro" style={{ marginTop: 8 }}>at age {inputs.person.maxAge}</div>
        </div>

        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>P10 end balance</div>
          <div className="metric">
            <div className="value-mono num">{formatMoneyAbbreviated(result.p10EndBalance)}</div>
          </div>
          <div className="micro" style={{ marginTop: 8 }}>worst-case decile</div>
        </div>

        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>Median depletion age</div>
          <div className="metric">
            <div className="value-mono num" style={{ color: result.medianDepleteAge ? 'var(--bad)' : 'var(--good)' }}>
              {result.medianDepleteAge ?? '—'}
            </div>
          </div>
          <div className="micro" style={{ marginTop: 8 }}>
            {result.medianDepleteAge ? 'among failing runs' : 'all runs survived'}
          </div>
        </div>
      </div>

      {/* Fan chart */}
      <div
        className="card"
        style={{
          marginBottom: 20,
          padding: 20,
          opacity: stale ? 0.6 : 1,
          transition: 'opacity .3s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0 }}>Portfolio trajectory</h3>
            <div className="micro" style={{ marginTop: 2 }}>P10 / P50 / P90 across 1,000 runs</div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <HiFanChart result={result} retireAge={inputs.person.currentAge} />
        </div>
      </div>

      {/* Tornado chart */}
      <div
        className="card"
        style={{
          padding: 20,
          opacity: stale ? 0.6 : 1,
          transition: 'opacity .3s',
        }}
      >
        <h3 style={{ margin: '0 0 4px' }}>Sensitivity</h3>
        <div className="micro" style={{ marginBottom: 16 }}>Impact of ±20% change on success rate</div>
        <HiTornado data={sensitivity} />
      </div>
    </div>
  )
}
