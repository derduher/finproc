/**
 * v2 transparency components — surface each modelling simplification as an
 * assumption with its bias direction (methodology cross-cutting principle), plus
 * the flat-vs-guardrails spending toggle.
 */
import { formatMoneyAbbreviated as fmt } from '../../math'

export type Bias = 'opt' | 'cons' | 'two'

/** opt = optimistic ↑, cons = conservative ↓, two = two-sided ⇄ */
export function AssumptionChip({ bias, label, hint, onClick }: { bias: Bias; label: string; hint?: string; onClick?: () => void }) {
  const glyph = bias === 'opt' ? '↑' : bias === 'cons' ? '↓' : '⇄'
  return (
    <button type="button" className="achip" onClick={onClick} aria-label={`${label}${hint ? ` — ${hint}` : ''}. How we model this`}>
      <span className={'bias ' + bias}>{glyph}</span>
      <span>{label}</span>
      {hint && <span className="ahint">· {hint}</span>}
    </button>
  )
}

export interface AssumptionItem {
  bias: Bias
  label: string
  hint?: string
}

/** Default assumption set; `maxAge` flows into the longevity chip. */
export function AssumptionBar({
  maxAge,
  onMethodology,
}: {
  maxAge: number
  onMethodology?: () => void
}) {
  const items: AssumptionItem[] = [
    { bias: 'opt', label: 'Historical returns', hint: "optimistic at today's valuations" },
    { bias: 'cons', label: 'Flat tax rate', hint: 'overstates retirement tax' },
    { bias: 'two', label: `Plan ends age ${maxAge}`, hint: 'ignores longevity' },
    { bias: 'two', label: 'Returns vary year to year', hint: 'sequence risk modeled' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span className="label" style={{ marginRight: 2 }}>assumptions</span>
      {items.map((it) => (
        <AssumptionChip key={it.label} bias={it.bias} label={it.label} hint={it.hint} onClick={onMethodology} />
      ))}
      <button className="btn btn-sm btn-ghost" style={{ marginLeft: 2 }} onClick={onMethodology}>
        How we model this →
      </button>
    </div>
  )
}

/** Flat vs guardrails spending policy. */
export function ModeToggle({
  mode,
  guardStart,
  onChange,
}: {
  mode: 'flat' | 'guardrails'
  guardStart?: number
  onChange?: (m: 'flat' | 'guardrails') => void
}) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button type="button" className={'modecard' + (mode === 'flat' ? ' on' : '')} onClick={() => onChange?.('flat')} style={{ textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: mode === 'flat' ? 500 : 400 }}>Flat spending</div>
          {mode === 'flat' && <span className="badge badge-accent">on</span>}
        </div>
        <div className="micro" style={{ marginTop: 4 }}>Same real amount every year, come what may.</div>
      </button>
      <button type="button" className={'modecard' + (mode === 'guardrails' ? ' on' : '')} onClick={() => onChange?.('guardrails')} style={{ textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: mode === 'guardrails' ? 500 : 400 }}>Guardrails</div>
          {mode === 'guardrails' && <span className="badge badge-accent">on</span>}
        </div>
        <div className="micro" style={{ marginTop: 4 }}>
          Flex spending ±10% with markets{guardStart ? <>. Start higher (~{fmt(guardStart)}).</> : '.'}
        </div>
      </button>
    </div>
  )
}
