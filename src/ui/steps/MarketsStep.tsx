import { Field, NumInput } from '../shared/Field'
import { useStore } from '../../store'

export function MarketsStep() {
  const inputs = useStore((s) => s.inputs)
  const patchInputs = useStore((s) => s.patchInputs)

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 4 }}>Market assumptions</h2>
      <p className="muted" style={{ marginBottom: 24, fontSize: 13 }}>
        Set the P10/P90 range for stock returns and inflation. The simulator
        draws from a normal distribution fit to these bounds each run.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 16 }}>Initial segment</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Field
            label="Stock growth — low (P10)"
            hint="Annual nominal return"
            tooltip="10th-percentile annual return — roughly the floor you'd see in a weak year. Used together with P90 to fit a normal distribution for each MC run."
          >
            <NumInput
              id="stock-low"
              type="number" min={-50} max={200} step={0.1} suffix="%"
              value={(inputs.initialStockGrowthMin * 100).toFixed(1)}
              aria-label="Stock growth P10 as a percentage"
              onChange={(e) => patchInputs({ initialStockGrowthMin: Number(e.target.value) / 100 })}
            />
          </Field>

          <Field
            label="Stock growth — high (P90)"
            hint="Annual nominal return"
            tooltip="90th-percentile annual return — roughly the ceiling in a strong year. The spread between P10 and P90 controls how much variance each run samples."
          >
            <NumInput
              id="stock-high"
              type="number" min={-50} max={200} step={0.1} suffix="%"
              value={(inputs.initialStockGrowthMax * 100).toFixed(1)}
              aria-label="Stock growth P90 as a percentage"
              onChange={(e) => patchInputs({ initialStockGrowthMax: Number(e.target.value) / 100 })}
            />
          </Field>

          <Field
            label="Inflation — low (P10)"
            tooltip="Simplification: a single annual inflation rate is applied uniformly to all expenses. No category-specific inflation rates are modeled."
          >
            <NumInput
              id="inflation-low"
              type="number" min={-20} max={100} step={0.1} suffix="%"
              value={(inputs.initialInflationMin * 100).toFixed(1)}
              aria-label="Inflation P10 as a percentage"
              onChange={(e) => patchInputs({ initialInflationMin: Number(e.target.value) / 100 })}
            />
          </Field>

          <Field
            label="Inflation — high (P90)"
            tooltip="Together with the P10 value this defines the distribution of inflation drawn each run. Higher spread = more uncertainty in real purchasing power."
          >
            <NumInput
              id="inflation-high"
              type="number" min={-20} max={100} step={0.1} suffix="%"
              value={(inputs.initialInflationMax * 100).toFixed(1)}
              aria-label="Inflation P90 as a percentage"
              onChange={(e) => patchInputs({ initialInflationMax: Number(e.target.value) / 100 })}
            />
          </Field>
        </div>
      </div>

      <div
        className="card card-sunk"
        role="note"
        aria-label="Modeling simplification"
        style={{ fontSize: 12, color: 'var(--ink-3)' }}
      >
        <strong style={{ color: 'var(--ink-2)' }}>Simplification:</strong>{' '}
        One rate draw per segment per run (not per year). All-equity portfolio — no bond allocation glide path modeled.
      </div>
    </div>
  )
}
