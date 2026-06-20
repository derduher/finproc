/**
 * Intake field atoms + wizard chrome (top bar, step rail, page shell).
 *
 * The atoms render the `.intk-*` classes from styles-v2.css and wrap real
 * controls so each step reads as a live form, not a static mock.
 */
import type { ReactNode } from 'react'
import { Logo } from '../../frame/Logo'
import { MoneyInput } from '../../shared/MoneyInput'
import { SheetField } from '../../shared/SheetField'
import { INTAKE_STEPS } from '../../../hooks/useIntake'

/** Compose the value preview shown on the mobile sheet trigger. A `%`-leading
 *  suffix hugs the number ("100% stocks"); word suffixes get a space ("6,000 / yr"). */
function preview(pre: string | undefined, body: string, suf: string | undefined): string {
  if (!suf) return `${pre ?? ''}${body}`
  const sep = suf.startsWith('%') ? '' : ' '
  return `${pre ?? ''}${body}${sep}${suf}`
}

export function Chevron({ s = 11 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 11 11" aria-hidden>
      <path d="M2.5 4 L5.5 7 L8.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Check({ s = 12 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 6.2 L4.8 8.6 L9.5 3.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IntakeTop({ note = 'Setting up your plan' }: { note?: string }) {
  return (
    <div className="intk-top">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <Logo />
        <div style={{ width: 1, height: 20, background: 'var(--line)', flex: 'none' }} />
        <span className="micro" style={{ color: 'var(--ink-3)' }}>{note}</span>
      </div>
    </div>
  )
}

/** Left rail of the wizard; rail index `active` is the current step minus the intro. */
export function StepRail({ active, onGoto }: { active: number; onGoto: (railIndex: number) => void }) {
  return (
    <nav className="intk-rail" aria-label="Setup steps">
      <div className="label" style={{ padding: '0 12px 10px' }}>your plan</div>
      {INTAKE_STEPS.map((s, i) => {
        const state = i < active ? 'done' : i === active ? 'active' : ''
        return (
          <button
            key={s.t}
            type="button"
            className={'intk-step ' + state}
            aria-current={i === active ? 'step' : undefined}
            onClick={() => onGoto(i)}
          >
            <span className="ix">{i < active ? <Check /> : i + 1}</span>
            <span>
              <span className="st-t" style={{ display: 'block' }}>{s.t}</span>
              <span className="st-s" style={{ display: 'block' }}>{s.s}</span>
            </span>
          </button>
        )
      })}
      <div style={{ flex: 1 }} />
      <div className="intk-rail-foot">
        <div className="micro" style={{ lineHeight: 1.5 }}>
          Everything has a sensible default — but the more of this we have, the less we have to guess.
        </div>
      </div>
    </nav>
  )
}

/** Top bar + rail + scrollable main with a sticky footer (Back / primary). */
export function IntakeShell({
  active,
  eyebrow,
  title,
  lead,
  children,
  primary = 'Continue',
  onBack,
  onNext,
  onGoto,
  footNote,
}: {
  active: number
  eyebrow: string
  title: string
  lead?: string
  children: ReactNode
  primary?: string
  onBack?: () => void
  onNext: () => void
  onGoto: (railIndex: number) => void
  footNote?: ReactNode
}) {
  return (
    <div className="hf" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <IntakeTop />
      <div className="intk-body">
        <StepRail active={active} onGoto={onGoto} />
        <div className="intk-main">
          <div className="intk-main-inner">
            <div className="label" style={{ marginBottom: 10, color: 'var(--accent-ink)' }}>{eyebrow}</div>
            <h1 style={{ fontSize: 32, lineHeight: 1.12, marginBottom: 12, maxWidth: 560 }}>{title}</h1>
            {lead && <div style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.55, marginBottom: 28, maxWidth: 540 }}>{lead}</div>}
            {children}
          </div>
          <div className="intk-foot">
            <div className="micro" style={{ maxWidth: 520, lineHeight: 1.5 }}>{footNote}</div>
            <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
              {onBack && <button className="btn" onClick={onBack}>Back</button>}
              <button className="btn btn-primary" style={{ paddingRight: 16 }} onClick={onNext}>{primary} →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Field atoms ─────────────────────────────────────────────────────────────────
export function FieldCol({ label, hint, children, w }: { label: string; hint?: string; children: ReactNode; w?: number }) {
  return (
    <div className="intk-fc" style={{ width: w }}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="micro" style={{ marginTop: 1 }}>{hint}</span>}
    </div>
  )
}

export function NumField({ value, onChange, pre, suf, w, label }: { value: number; onChange: (v: number) => void; pre?: string; suf?: string; w?: number; label: string }) {
  return (
    <SheetField label={label} display={preview(pre, String(value), suf)}>
      <span className="intk-in" style={{ width: w }}>
        {pre && <span className="pre">{pre}</span>}
        <input type="number" aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {suf && <span className="suf">{suf}</span>}
      </span>
    </SheetField>
  )
}

export function MoneyField({ value, onChange, pre = '$', suf, w, label, step = 1000 }: { value: number; onChange: (v: number) => void; pre?: string; suf?: string; w?: number; label: string; step?: number }) {
  return (
    <SheetField label={label} display={preview(pre, value.toLocaleString('en-US'), suf)}>
      <span className="intk-in" style={{ width: w }}>
        {pre && <span className="pre">{pre}</span>}
        <MoneyInput value={value} onChange={onChange} step={step} aria-label={label} allowEmptyForZero />
        {suf && <span className="suf">{suf}</span>}
      </span>
    </SheetField>
  )
}

export function TextField({ value, onChange, w, label }: { value: string; onChange: (v: string) => void; w?: number; label: string }) {
  return (
    <SheetField label={label} display={value || '—'}>
      <span className="intk-in text" style={{ width: w }}>
        <input type="text" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </SheetField>
  )
}

export function SelectField<T extends string>({ value, onChange, options, w, label }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<readonly [T, string]>; w?: number; label: string }) {
  return (
    <span className="intk-sel" style={{ width: w }}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <Chevron />
    </span>
  )
}

export function CB({ on, onToggle, children, strong }: { on: boolean; onToggle: () => void; children: ReactNode; strong?: boolean }) {
  return (
    <label className="intk-cbrow">
      <input type="checkbox" checked={on} onChange={onToggle} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span className={'intk-cb' + (on ? ' on' : '')} aria-hidden>{on && <span style={{ color: 'var(--bg)' }}><Check s={11} /></span>}</span>
      <span style={{ fontSize: 13.5, color: strong ? 'var(--ink)' : 'var(--ink-2)' }}>{children}</span>
    </label>
  )
}

export function AddRowBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="btn btn-sm btn-ghost" style={{ marginTop: 10, paddingLeft: 6, whiteSpace: 'nowrap' }} onClick={onClick}>
      <svg width="13" height="13" viewBox="0 0 13 13" style={{ marginRight: 4 }} aria-hidden><path d="M6.5 2 V11 M2 6.5 H11" stroke="var(--accent-ink)" strokeWidth="1.5" strokeLinecap="round" /></svg>
      {children}
    </button>
  )
}

export function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button className="btn btn-sm btn-ghost btn-icon" aria-label={label} onClick={onClick}>{children}</button>
  )
}
