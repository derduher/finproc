import { useStore } from '../../store'
import { createExpenseItem } from '../../sim/expenses'
import { EXPENSE_CATEGORIES } from '../../schema'
import type { OneTimeExpense, SocialSecurity, ExpenseItem } from '../../schema'

interface TimelineMarker {
  age: number
  label: string
  color: 'ink' | 'accent' | 'bad'
}

function LifeTimeline({
  startAge,
  endAge,
  events,
  markers,
  onAddAtAge,
}: {
  startAge: number
  endAge: number
  events: OneTimeExpense[]
  markers: TimelineMarker[]
  onAddAtAge?: (age: number) => void
}) {
  const width = 980
  const height = 240
  const pad = { l: 60, r: 40 }
  const cw = width - pad.l - pad.r
  const ageX = (a: number) => pad.l + ((a - startAge) / (endAge - startAge)) * cw
  const baselineY = 180

  return (
    <div aria-label="Life timeline" className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="label">your timeline · life events</div>
      </div>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Life events over time"
        style={{ display: 'block' }}
      >
        {/* baseline expense band */}
        <rect x={pad.l} y={baselineY} width={cw} height="22" fill="var(--bg-sunk)" stroke="var(--line)" />
        <text x={pad.l + 8} y={baselineY + 14} fontFamily="var(--font-body)" fontSize="10" fill="var(--ink-3)" letterSpacing="0.05em">BASELINE EXPENSES</text>

        {/* main timeline axis */}
        <line x1={pad.l} y1="150" x2={pad.l + cw} y2="150" stroke="var(--chart-axis)" strokeWidth="1.4" />

        {/* age ticks */}
        {Array.from({ length: 7 }, (_, i) => startAge + Math.round(((endAge - startAge) / 6) * i)).map((a) => (
          <g key={a}>
            <line x1={ageX(a)} y1="150" x2={ageX(a)} y2="156" stroke="var(--chart-axis)" />
            <text x={ageX(a)} y="170" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)" textAnchor="middle">
              {a}
            </text>
          </g>
        ))}

        {/* click-to-add zones — one invisible rect per year of the timeline. */}
        {onAddAtAge &&
          Array.from({ length: endAge - startAge + 1 }, (_, i) => startAge + i).map((age) => {
            const cellWidth = cw / (endAge - startAge + 1)
            const x = ageX(age) - cellWidth / 2
            return (
              <rect
                key={age}
                data-add-event-at-age={age}
                x={x}
                y="40"
                width={cellWidth}
                height="120"
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => onAddAtAge(age)}
              >
                <title>Click to add event at age {age}</title>
              </rect>
            )
          })}

        {/* event dots */}
        {events.map((e) => {
          if (e.age < startAge || e.age > endAge) return null
          const amtK = e.amountPresentDollars / 1000
          const r = Math.max(8, Math.min(28, amtK / 4.5))
          const px = ageX(e.age)
          const py = 150 - r - 4
          return (
            <g key={e.id}>
              <line x1={px} y1="150" x2={px} y2={py + r} stroke="var(--line-strong)" strokeWidth="1" />
              {e.recurringFollowOnAmount !== undefined && (
                <line
                  x1={px + r}
                  y1={py}
                  x2={ageX(endAge) - 4}
                  y2={py}
                  stroke="var(--ink-3)"
                  strokeWidth="1.2"
                  strokeDasharray="2 4"
                  opacity="0.6"
                />
              )}
              <circle cx={px} cy={py} r={r} fill="var(--bg-elev)" stroke="var(--ink)" strokeWidth="1.4" />
              <text x={px} y={py + 4} fontFamily="var(--font-mono)" fontSize={r > 14 ? '12' : '10'} fill="var(--ink)" textAnchor="middle">
                ${amtK.toFixed(0)}K
              </text>
              <text x={px} y="135" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-2)" textAnchor="middle">
                {e.label}
              </text>
              {e.recurringFollowOnAmount !== undefined && (
                <text x={px + r + 6} y={py + 3} fontFamily="var(--font-body)" fontSize="10" fill="var(--ink-3)">
                  recurring →
                </text>
              )}
            </g>
          )
        })}

        {/* life markers (retire, SS, RMD) */}
        {markers.map((m) => {
          if (m.age < startAge || m.age > endAge) return null
          const px = ageX(m.age)
          const col = m.color === 'accent' ? 'var(--accent)' : m.color === 'bad' ? 'var(--bad)' : 'var(--ink)'
          return (
            <g key={m.label}>
              <line x1={px} y1="32" x2={px} y2={baselineY + 22} stroke={col} strokeWidth="1" strokeDasharray="3 4" opacity="0.5" />
              <g transform={`translate(${px}, 24)`}>
                <rect x="-46" y="-12" width="92" height="20" rx="3" fill="var(--bg-elev)" stroke={col} strokeWidth="1" />
                <text x="0" y="2" fontFamily="var(--font-body)" fontSize="11" fill={col} textAnchor="middle">
                  {m.label}
                </text>
              </g>
            </g>
          )
        })}

        {/* current-age marker */}
        <circle cx={ageX(startAge)} cy="150" r="4" fill="var(--ink)" />
        <text
          x={ageX(startAge)}
          y="113"
          fontFamily="var(--font-body)"
          fontSize="10"
          fill="var(--ink-3)"
          textAnchor="middle"
          letterSpacing="0.05em"
        >
          TODAY
        </text>
      </svg>
    </div>
  )
}

function EventCard({
  event,
  onPatch,
  onRemove,
}: {
  event: OneTimeExpense
  onPatch: (patch: Partial<OneTimeExpense>) => void
  onRemove: () => void
}) {
  return (
    <div data-event-card className="card" style={{ flex: 1, minWidth: 220, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <input
          className="field"
          style={{ fontSize: 14, color: 'var(--ink)', border: 'none', background: 'transparent', padding: 0, height: 'auto' }}
          value={event.label}
          aria-label="Event name"
          onChange={(e) => onPatch({ label: e.target.value })}
        />
        <button
          type="button"
          aria-label="Remove event"
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ink-3)',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ⋯
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-3)' }}>
        at age
        <input
          type="number"
          className="field field-num"
          style={{ width: 56, height: 24, padding: '0 6px' }}
          value={event.age}
          aria-label="Event age"
          onChange={(e) => onPatch({ age: Number(e.target.value) })}
        />
        ·
        <input
          type="number"
          className="field field-num"
          style={{ width: 92, height: 24, padding: '0 6px' }}
          value={event.amountPresentDollars}
          step={1000}
          aria-label="Event amount"
          onChange={(e) => onPatch({ amountPresentDollars: Number(e.target.value) })}
        />
        in today's $
      </div>
      {event.recurringFollowOnAmount !== undefined && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 8px',
            background: 'var(--bg-sunk)',
            borderLeft: '2px solid var(--accent)',
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--ink-2)',
          }}
        >
          + ${event.recurringFollowOnAmount.toLocaleString()} / yr recurring
        </div>
      )}
    </div>
  )
}

export function ExpensesStep() {
  const inputs = useStore((s) => s.inputs)
  const patchInputs = useStore((s) => s.patchInputs)
  const setBaselineExpenses = useStore((s) => s.setBaselineExpenses)

  const ss = inputs.socialSecurity
  const retireAge = inputs.person.retirementAge

  const items = inputs.baselineExpenses
  const updateItem = (id: string, patch: Partial<ExpenseItem>) =>
    setBaselineExpenses(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  const removeItem = (id: string) => setBaselineExpenses(items.filter((i) => i.id !== id))
  const addItem = () => setBaselineExpenses([...items, createExpenseItem({ label: 'New expense' })])

  const updateSS = (patch: Partial<SocialSecurity>) => {
    patchInputs({
      socialSecurity: ss
        ? { ...ss, ...patch }
        : { annualAmountPresentDollars: 0, claimAge: 67, ...patch },
    })
  }

  const addExpenseAtAge = (age: number) => {
    const exp: OneTimeExpense = {
      id: crypto.randomUUID(),
      label: 'New event',
      age,
      amountPresentDollars: 10000,
    }
    patchInputs({ oneTimeExpenses: [...inputs.oneTimeExpenses, exp] })
  }
  const addExpense = () => addExpenseAtAge(50)

  const updateExpense = (id: string, patch: Partial<OneTimeExpense>) => {
    patchInputs({
      oneTimeExpenses: inputs.oneTimeExpenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })
  }

  const removeExpense = (id: string) => {
    patchInputs({ oneTimeExpenses: inputs.oneTimeExpenses.filter((e) => e.id !== id) })
  }

  const markers: TimelineMarker[] = []
  if (retireAge > inputs.person.currentAge) markers.push({ age: retireAge, label: 'retire', color: 'ink' })
  if (ss) markers.push({ age: ss.claimAge, label: 'Soc Sec begins', color: 'accent' })
  markers.push({ age: 73, label: 'RMDs', color: 'bad' })

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 6 }}>Step 4 of 6 · expenses</div>
        <h1>What does life cost?</h1>
      </div>

      <p className="muted" style={{ fontSize: 14, marginBottom: 20, maxWidth: 640 }}>
        Baseline annual spending, plus one-time and recurring life events. All amounts in today's dollars.
      </p>

      {/* Baseline itemized card */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div className="label">baseline annual expenses · itemized</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="num" style={{ fontSize: 24, color: 'var(--ink)' }}>
              ${inputs.annualExpenses.toLocaleString()}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>/ yr · today's $</span>
          </div>
        </div>

        <div data-expense-list style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <div
              data-expense-item
              key={item.id}
              style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <input
                className="field"
                aria-label="Expense name"
                value={item.label}
                onChange={(e) => updateItem(item.id, { label: e.target.value })}
                style={{ flex: '1 1 160px', minWidth: 120 }}
              />
              <select
                className="field"
                aria-label="Expense category"
                value={item.category}
                onChange={(e) => updateItem(item.id, { category: e.target.value as ExpenseItem['category'] })}
                style={{ flex: '0 0 auto', height: 32, textTransform: 'capitalize' }}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>$</span>
              <input
                type="number"
                className="field field-num"
                aria-label="Expense amount"
                min={0}
                step={500}
                value={item.annualAmountPresentDollars}
                onChange={(e) => updateItem(item.id, { annualAmountPresentDollars: Number(e.target.value) })}
                style={{ width: 110, height: 32 }}
              />
              <button
                type="button"
                aria-label="Remove expense"
                onClick={() => removeItem(item.id)}
                disabled={items.length <= 1}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: items.length <= 1 ? 'not-allowed' : 'pointer',
                  color: 'var(--ink-3)',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 4,
                  opacity: items.length <= 1 ? 0.4 : 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addItem} className="btn btn-sm btn-ghost" style={{ marginTop: 10 }}>
          + add expense
        </button>
        <div className="micro" style={{ marginTop: 6 }}>auto-inflated forward at prevailing rate</div>
      </div>

      {/* Social Security + net need */}
      <div
        className="card"
        style={{ marginTop: 16, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div className="label">social security</div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                if (ss) patchInputs({ socialSecurity: undefined })
                else updateSS({ annualAmountPresentDollars: 24000, claimAge: 67 })
              }}
            >
              {ss ? 'Remove' : '+ Add'}
            </button>
          </div>
          {ss ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="num" style={{ fontSize: 22, color: 'var(--ink)' }}>
                  ${ss.annualAmountPresentDollars.toLocaleString()}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>/ yr</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  type="number"
                  className="field field-num"
                  style={{ width: 100, height: 28 }}
                  value={ss.annualAmountPresentDollars}
                  aria-label="Social Security annual amount"
                  onChange={(e) => updateSS({ annualAmountPresentDollars: Number(e.target.value) })}
                />
                <input
                  type="number"
                  className="field field-num"
                  style={{ width: 56, height: 28 }}
                  min={62}
                  max={70}
                  value={ss.claimAge}
                  aria-label="Social Security claim age"
                  onChange={(e) => updateSS({ claimAge: Number(e.target.value) })}
                />
              </div>
              <div className="micro" style={{ marginTop: 4 }}>
                claim at age <span className="num">{ss.claimAge}</span> · auto-COLA
              </div>
            </>
          ) : (
            <div className="micro">not claimed</div>
          )}
        </div>

        <div>
          <div className="label" style={{ marginBottom: 6 }}>net need · age {retireAge}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="num" style={{ fontSize: 22, color: 'var(--bad)' }}>
              ~${Math.round(inputs.annualExpenses * Math.pow(1 + inputs.initialInflationMin + 0.01, Math.max(0, retireAge - inputs.person.currentAge)) / 1000)}K
            </span>
            <span className="muted" style={{ fontSize: 12 }}>/ yr nominal</span>
          </div>
          <div className="micro" style={{ marginTop: 4 }}>before SS, inflation applied</div>
        </div>
      </div>

      {/* Life timeline */}
      <div style={{ marginTop: 16 }}>
        <LifeTimeline
          startAge={inputs.person.currentAge}
          endAge={inputs.person.maxAge}
          events={inputs.oneTimeExpenses}
          markers={markers}
          onAddAtAge={addExpenseAtAge}
        />
      </div>

      {/* Event cards */}
      <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        {inputs.oneTimeExpenses.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            onPatch={(patch) => updateExpense(e.id, patch)}
            onRemove={() => removeExpense(e.id)}
          />
        ))}
        <button
          type="button"
          onClick={addExpense}
          className="card"
          style={{
            flex: 1,
            minWidth: 180,
            padding: 14,
            border: '1px dashed var(--line-strong)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-3)',
            cursor: 'pointer',
            background: 'transparent',
            font: 'inherit',
          }}
        >
          <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 4 }}>＋</div>
          <div style={{ fontSize: 12 }}>add event</div>
        </button>
      </div>
    </div>
  )
}
