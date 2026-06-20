/**
 * ResultExplorer — the interactive headline of the live screen.
 *
 * A "solve for" toggle (earliest age ⇄ most I can spend), a confidence slider,
 * and a second lever (target spend / retire age) drive the headline. The solved
 * values and confidence come in as props — MainScreen owns the solver hooks so
 * there's a single off-thread solve and the rest of the screen stays consistent.
 * Slider moves and plan-chip edits patch the store directly; the futures chart
 * below re-renders from the same inputs.
 */
import { useState } from 'react'
import { useStore } from '../../store'
import { MoneyInput } from '../shared/MoneyInput'
import { useIsMobile } from '../shared/useIsMobile'
import { useDialogA11y } from '../shared/useDialogA11y'
import { totalSaved, annualAdditions } from './planSummary'

/** Compact USD like the design mock: $88K, $1.2M, $0. */
export function fmtUSD(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (v === 0) return '$0'
  const a = Math.abs(v)
  if (a >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`
  if (a >= 1e3) return `$${Math.round(v / 1e3)}K`
  return `$${Math.round(v)}`
}

type Mode = 'age' | 'spend'

function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  fmt,
  foot,
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
  fmt: (v: number) => string
  foot?: React.ReactNode
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="label">{label}</span>
        <span className="ex-cur">{fmt(value)}</span>
      </div>
      <input
        type="range"
        className="ex-range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--bg-sunk) ${pct}%)` }}
      />
      {foot && <div className="micro" style={{ marginTop: 7, lineHeight: 1.45 }}>{foot}</div>}
    </div>
  )
}

function EditIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" style={{ color: 'var(--ink-4)' }} aria-hidden>
      <path d="M8 1.5 L10.5 4 L4 10.5 L1.5 10.5 L1.5 8 Z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}

function EditPopover({
  title,
  initial,
  kind,
  suf,
  note,
  onApply,
  onCancel,
}: {
  title: string
  initial: number
  kind: 'number' | 'money'
  suf?: string
  note?: string
  onApply: (v: number) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const fieldLabel = `Edit ${title} value`
  // On mobile the popover is a full-screen bottom sheet (lock the page scroll);
  // on desktop it's a small inline popover (don't). Escape + focus management
  // apply in both.
  const isMobile = useIsMobile()
  const ref = useDialogA11y<HTMLDivElement>(onCancel, { lockScroll: isMobile })
  return (
    <div ref={ref} className="ex-pop" role="dialog" aria-modal="true" aria-label={`Edit ${title}`}>
      <div className="ex-pop-arrow" />
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 8, textTransform: 'capitalize' }}>{title}</div>
      <div className="intk-in" style={{ width: '100%', borderColor: 'var(--ink)', boxShadow: '0 0 0 1px var(--ink)' }}>
        {kind === 'money' && <span className="pre">$</span>}
        {kind === 'money' ? (
          <MoneyInput aria-label={fieldLabel} value={draft} onChange={setDraft} step={1000} />
        ) : (
          <input type="number" aria-label={fieldLabel} value={draft} onChange={(e) => setDraft(Number(e.target.value))} />
        )}
        {suf && <span className="suf">{suf}</span>}
      </div>
      {note && <div className="micro" style={{ marginTop: 10, lineHeight: 1.45 }}>{note}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-sm btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onApply(draft)}>Apply</button>
        <button className="btn btn-sm" style={{ justifyContent: 'center' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function PlanChip({
  k,
  v,
  open,
  onClick,
  children,
}: {
  k: string
  v: string
  open?: boolean
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button className={'ex-chip' + (open ? ' on' : '')} aria-label={`edit ${k}`} onClick={onClick}>
        <span className="ex-chip-k">{k}</span>
        <span className="ex-chip-v">{v}</span>
        <EditIcon />
      </button>
      {open && children}
    </div>
  )
}

export interface ResultExplorerProps {
  /** Target success rate (0–1) the headline is solved at. */
  confidence: number
  /** Sustainable annual spend at the current age + confidence (null while solving). */
  sustainableSpend: number | null
  /** Earliest retirement age at the current target spend + confidence. */
  earliestAge: number | null | undefined
  solvingSpend: boolean
  solvingAge: boolean
  onConfidenceChange: (target: number) => void
  onAdvanced: () => void
}

export function ResultExplorer({
  confidence,
  sustainableSpend,
  earliestAge,
  solvingSpend,
  solvingAge,
  onConfidenceChange,
  onAdvanced,
}: ResultExplorerProps) {
  const inputs = useStore((s) => s.inputs)
  const patchPerson = useStore((s) => s.patchPerson)
  const setExpensesTotal = useStore((s) => s.setExpensesTotal)
  const [mode, setMode] = useState<Mode>('age')
  const [openChip, setOpenChip] = useState<string | null>(null)

  const { person } = inputs
  const conf = Math.round(confidence * 100)
  const yearsAway = earliestAge != null ? Math.max(0, earliestAge - person.currentAge) : null

  const toggle = (k: string) => setOpenChip((o) => (o === k ? null : k))
  const applyAndClose = (fn: () => void) => {
    fn()
    setOpenChip(null)
  }

  return (
    <div>
      <div className="v2-hero-grid" style={{ marginBottom: 22 }}>
        {/* readout */}
        <div>
          <div className="label" style={{ marginBottom: 10 }}>
            {mode === 'age' ? 'the earliest you could retire' : 'the most you could sustainably spend'}
          </div>
          {mode === 'age' ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="hero-spend" style={{ fontSize: 84 }}>
                {earliestAge == null ? (solvingAge ? '…' : '—') : earliestAge === undefined ? 'not yet' : `age ${earliestAge}`}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="hero-spend" style={{ fontSize: 76 }}>{sustainableSpend == null ? '…' : fmtUSD(sustainableSpend)}</span>
              <span style={{ fontSize: 20, color: 'var(--ink-3)' }}>/ year</span>
            </div>
          )}
          <div style={{ fontSize: 14.5, color: 'var(--ink-2)', marginTop: 14, maxWidth: 470, lineHeight: 1.55 }}>
            {mode === 'age' ? (
              <>
                {yearsAway != null && earliestAge != null && (
                  <>That's <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{yearsAway} years</b> from today. </>
                )}
                Spend <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{fmtUSD(inputs.annualExpenses)}/yr</b> and <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{conf}% of a thousand market histories</b> keep money to age {person.maxAge}.
              </>
            ) : (
              <>
                Retire at <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{person.retirementAge}</b> and this is the spend level where <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{conf}%</b> of a thousand market histories still keep money to age {person.maxAge}. Your target is {fmtUSD(inputs.annualExpenses)}.
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <div className="intk-stat"><span className="k">{mode === 'age' ? 'target spend' : 'retire at'}</span><span className="v">{mode === 'age' ? fmtUSD(inputs.annualExpenses) + '/yr' : 'age ' + person.retirementAge}</span></div>
            <div className="intk-stat"><span className="k">confidence</span><span className="v">{conf}%</span></div>
            <div className="intk-stat"><span className="k">plan to</span><span className="v">age {person.maxAge}</span></div>
          </div>
        </div>

        {/* controls */}
        <div className="ex-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span className="label">solve for</span>
            <div className="seg">
              <button type="button" className={mode === 'age' ? 'on' : ''} onClick={() => setMode('age')}>Earliest age</button>
              <button type="button" className={mode === 'spend' ? 'on' : ''} onClick={() => setMode('spend')}>Most I can spend</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Slider
              label="Confidence"
              min={80}
              max={99}
              value={conf}
              onChange={(v) => onConfidenceChange(v / 100)}
              fmt={(v) => v + '% of histories hold'}
              foot={<>How safe to be. Higher confidence means {mode === 'age' ? 'retiring later' : 'spending less'} — the price of a bigger safety margin.</>}
            />
            {mode === 'age' ? (
              <Slider
                label="Target spend"
                min={40_000}
                max={200_000}
                step={1000}
                value={inputs.annualExpenses}
                onChange={(v) => setExpensesTotal(v)}
                fmt={(v) => fmtUSD(v) + ' / yr'}
                foot={<>What you want to spend each year. Spend more and the earliest age you can retire moves out.</>}
              />
            ) : (
              <Slider
                label="Retire at age"
                min={Math.max(40, person.currentAge)}
                max={person.maxAge}
                value={person.retirementAge}
                onChange={(v) => patchPerson({ retirementAge: v })}
                fmt={(v) => 'age ' + v}
                foot={<>When you stop working. Wait longer and the sustainable spend climbs.</>}
              />
            )}
          </div>
          <div className="ex-tradeoff">
            <span>
              {mode === 'age'
                ? <>At <b>{conf}%</b> confidence, spending <b>{fmtUSD(inputs.annualExpenses)}</b> {solvingAge || earliestAge == null ? '⟶ solving…' : <>⟶ retire at <b>{earliestAge}</b>.</>}</>
                : <>At <b>{conf}%</b> confidence, retiring at <b>{person.retirementAge}</b> {solvingSpend || sustainableSpend == null ? '⟶ solving…' : <>⟶ spend <b>{fmtUSD(sustainableSpend)}/yr</b>.</>}</>}
            </span>
          </div>
        </div>
      </div>

      {/* Backdrop for the inline editor. Inert on desktop (CSS hides it); on a
          phone it dims the screen behind the popover, which CSS turns into a
          bottom sheet. Tapping it closes the editor. */}
      {openChip && <div className="ex-scrim" aria-hidden onClick={() => setOpenChip(null)} />}

      {/* editable plan strip */}
      <div className="ex-planstrip">
        <span className="label" style={{ marginRight: 4 }}>your plan</span>
        <PlanChip k="age" v={String(person.currentAge)} open={openChip === 'age'} onClick={() => toggle('age')}>
          <EditPopover title="age" kind="number" suf="yrs" initial={person.currentAge}
            note="Resets the clock to the earliest retirement age."
            onApply={(v) => applyAndClose(() => patchPerson({ currentAge: v }))}
            onCancel={() => setOpenChip(null)} />
        </PlanChip>
        <PlanChip k="salary" v={fmtUSD(person.annualSalary)} open={openChip === 'salary'} onClick={() => toggle('salary')}>
          <EditPopover title="salary" kind="money" suf="/ yr" initial={person.annualSalary}
            onApply={(v) => applyAndClose(() => patchPerson({ annualSalary: v }))}
            onCancel={() => setOpenChip(null)} />
        </PlanChip>
        <PlanChip k="saved" v={fmtUSD(totalSaved(inputs))} onClick={onAdvanced} />
        <PlanChip k="adding" v={fmtUSD(Math.round(annualAdditions(inputs))) + '/yr'} onClick={onAdvanced} />
        <PlanChip k="spend" v={fmtUSD(inputs.annualExpenses) + '/yr'} open={openChip === 'spend'} onClick={() => toggle('spend')}>
          <EditPopover title="spend" kind="money" suf="/ yr" initial={inputs.annualExpenses}
            note="The projection and the earliest age re-run as you change this."
            onApply={(v) => applyAndClose(() => setExpensesTotal(v))}
            onCancel={() => setOpenChip(null)} />
        </PlanChip>
        <PlanChip
          k="Social Security"
          v={inputs.socialSecurity ? `${fmtUSD(inputs.socialSecurity.annualAmountPresentDollars)} @ ${inputs.socialSecurity.claimAge}` : 'none'}
          onClick={onAdvanced}
        />
        <button className="btn btn-sm" style={{ marginLeft: 'auto', flex: 'none' }} onClick={onAdvanced}>
          <svg width="13" height="13" viewBox="0 0 14 14" style={{ marginRight: 4 }} aria-hidden><circle cx="4" cy="4" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><line x1="6" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.3" /><circle cx="10" cy="10" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><line x1="2" y1="10" x2="8" y2="10" stroke="currentColor" strokeWidth="1.3" /></svg>
          Advanced
        </button>
      </div>
    </div>
  )
}
