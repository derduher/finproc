import { Field, NumInput } from '../shared/Field'
import { useStore } from '../../store'

export function PersonStep() {
  const person = useStore((s) => s.inputs.person)
  const patchPerson = useStore((s) => s.patchPerson)

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Eyebrow + headline (design: steps-input-1.jsx) */}
      <div style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 6 }}>Step 1 of 6 · about you</div>
        <h1>Tell us where you're starting from</h1>
      </div>

      <p
        className="muted"
        style={{ marginBottom: 24, fontSize: 14, maxWidth: 640 }}
      >
        Numbers in today's dollars. Salary growth defaults to inflation; override if your career is non-typical.
      </p>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 24, rowGap: 18 }}>
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
            label="Plan through age"
            tooltip="How far to project. The simulation ends here; we measure whether you run out before this age."
          >
            <NumInput
              id="planning-to-age"
              type="number" min={person.currentAge + 1} max={130}
              value={person.maxAge}
              aria-label="Plan through age"
              onChange={(e) => patchPerson({ maxAge: Number(e.target.value) })}
            />
          </Field>

          <Field
            label="Retirement age"
            hint="When salary stops, withdrawals begin"
            tooltip="Drives the retire marker on charts and the default contribution-stop / withdrawal-start age on new accounts. Per-account overrides still apply."
          >
            <NumInput
              id="retirement-age"
              type="number" min={person.currentAge} max={person.maxAge}
              value={person.retirementAge}
              aria-label="Retirement age"
              onChange={(e) => patchPerson({ retirementAge: Number(e.target.value) })}
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
              aria-label="Annual salary"
              onChange={(e) => patchPerson({ annualSalary: Number(e.target.value) })}
            />
          </Field>

          <Field
            label="Salary growth rate"
            hint="= inflation by default"
            tooltip="Real (inflation-adjusted) salary growth. 2–3% is typical for career progression."
          >
            <NumInput
              id="salary-growth"
              type="number" min={-50} max={50} step={0.1} suffix="%"
              value={(person.salaryGrowthRate * 100).toFixed(1)}
              aria-label="Salary growth rate"
              onChange={(e) => patchPerson({ salaryGrowthRate: Number(e.target.value) / 100 })}
            />
          </Field>

          {/* Tax assumptions sub-section */}
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="divider" style={{ margin: '0 0 8px' }} />
            <div className="label" style={{ marginBottom: 12 }}>tax assumptions</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <Field
                label="Marginal income tax"
                hint="applied to traditional withdrawals"
                tooltip="Simplification: a single flat rate is applied throughout. No bracket phaseouts or state-specific rules are modeled."
              >
                <NumInput
                  id="marginal-tax"
                  type="number" min={0} max={70} step={1} suffix="%"
                  value={(person.marginalTaxRate * 100).toFixed(0)}
                  aria-label="Marginal income tax rate"
                  onChange={(e) => patchPerson({ marginalTaxRate: Number(e.target.value) / 100 })}
                />
              </Field>

              <Field
                label="Long-term capital gains"
                hint="taxable account gains"
                tooltip="Applied to the gain fraction of taxable brokerage withdrawals. 0%, 15%, or 20% depending on income."
              >
                <NumInput
                  id="ltcg-rate"
                  type="number" min={0} max={40} step={1} suffix="%"
                  value={(person.ltcgRate * 100).toFixed(0)}
                  aria-label="Long-term capital gains rate"
                  onChange={(e) => patchPerson({ ltcgRate: Number(e.target.value) / 100 })}
                />
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Simplifications notice */}
      <div
        className="card card-sunk"
        role="note"
        aria-label="Documented simplifications"
        style={{
          marginTop: 16,
          padding: 16,
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" style={{ flex: 'none', marginTop: 1 }} aria-hidden="true">
          <circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--ink-3)" strokeWidth="1.4" />
          <path d="M9 5 V 9.5 M9 12.5 V 13" stroke="var(--ink-3)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>
          <b style={{ color: 'var(--ink)', fontWeight: 500 }}>Documented simplifications.</b>{' '}
          We model a flat marginal rate (not bracket-by-bracket), and don't reduce taxable income for traditional contributions. State taxes and healthcare costs aren't modeled — include them in your expenses on step&nbsp;4.
        </div>
      </div>
    </div>
  )
}
