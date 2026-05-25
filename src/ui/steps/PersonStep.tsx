import { Field, NumInput } from '../shared/Field'
import { useStore } from '../../store'

export function PersonStep() {
  const person = useStore((s) => s.inputs.person)
  const patchPerson = useStore((s) => s.patchPerson)

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 4 }}>About you</h2>
      <p className="muted" style={{ marginBottom: 24, fontSize: 13 }}>
        We'll use this to set the simulation timeline and tax assumptions.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Field
          label="Current age"
          tooltip="The simulation starts at this age and projects forward."
        >
          <NumInput
            id="current-age"
            type="number" min={18} max={100}
            value={person.currentAge}
            aria-label="Current age"
            onChange={(e) => patchPerson({ currentAge: Number(e.target.value) })}
          />
        </Field>

        <Field
          label="Planning to age"
          tooltip="How far to project. The simulation ends here; we measure whether you run out before this age."
        >
          <NumInput
            id="planning-to-age"
            type="number" min={person.currentAge + 1} max={130}
            value={person.maxAge}
            aria-label="Planning to age"
            onChange={(e) => patchPerson({ maxAge: Number(e.target.value) })}
          />
        </Field>

        <Field
          label="Annual salary"
          hint="Before tax, current dollars"
          tooltip="Used to compute payroll contributions. Set to 0 if already retired."
        >
          <NumInput
            id="annual-salary"
            type="number" min={0} step={1000} prefix="$"
            value={person.annualSalary}
            aria-label="Annual salary in dollars"
            onChange={(e) => patchPerson({ annualSalary: Number(e.target.value) })}
          />
        </Field>

        <Field
          label="Salary growth rate"
          hint="Annual % increase"
          tooltip="Real (inflation-adjusted) salary growth. 2–3% is typical for career progression."
        >
          <NumInput
            id="salary-growth"
            type="number" min={-50} max={50} step={0.1} suffix="%"
            value={(person.salaryGrowthRate * 100).toFixed(1)}
            aria-label="Salary growth rate as a percentage"
            onChange={(e) => patchPerson({ salaryGrowthRate: Number(e.target.value) / 100 })}
          />
        </Field>

        <Field
          label="Marginal tax rate"
          hint="Federal + state on ordinary income"
          tooltip="Simplification: a single flat rate is applied throughout. No bracket phaseouts or state-specific rules are modeled."
        >
          <NumInput
            id="marginal-tax"
            type="number" min={0} max={70} step={1} suffix="%"
            value={(person.marginalTaxRate * 100).toFixed(0)}
            aria-label="Marginal tax rate as a percentage"
            onChange={(e) => patchPerson({ marginalTaxRate: Number(e.target.value) / 100 })}
          />
        </Field>

        <Field
          label="LTCG rate"
          hint="Long-term capital gains rate"
          tooltip="Applied to the gain fraction of taxable brokerage withdrawals. 0%, 15%, or 20% depending on income."
        >
          <NumInput
            id="ltcg-rate"
            type="number" min={0} max={40} step={1} suffix="%"
            value={(person.ltcgRate * 100).toFixed(0)}
            aria-label="Long-term capital gains rate as a percentage"
            onChange={(e) => patchPerson({ ltcgRate: Number(e.target.value) / 100 })}
          />
        </Field>
      </div>

      {/* Simplifications notice */}
      <div
        className="card card-sunk"
        role="note"
        aria-label="Modeling simplifications"
        style={{ marginTop: 24, fontSize: 12, color: 'var(--ink-3)' }}
      >
        <strong style={{ color: 'var(--ink-2)' }}>Simplifications:</strong>{' '}
        Flat marginal rate throughout. No state tax phaseouts or AMT. Roth conversions not modeled.
        One MC draw per breakpoint segment (see Markets step).
      </div>
    </div>
  )
}
