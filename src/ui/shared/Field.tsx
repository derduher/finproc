import { useState } from 'react'

interface FieldProps {
  label: string
  hint?: string
  tooltip?: string
  children: React.ReactNode
  className?: string
  id?: string
}

export function Field({ label, hint, tooltip, children, className, id }: FieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label htmlFor={fieldId} className="label">{label}</label>
        {tooltip && <InfoTip tip={tooltip} />}
      </div>
      {/* Pass the id down to the first child via React.cloneElement if possible */}
      {children}
      {hint && <div className="micro">{hint}</div>}
    </div>
  )
}

/** Small (ⓘ) button that shows a tooltip on hover/focus. */
function InfoTip({ tip }: { tip: string }) {
  const [visible, setVisible] = useState(false)

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={`More info: ${tip}`}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
          color: 'var(--ink-4)',
          fontSize: 12,
          borderRadius: '50%',
          width: 16,
          height: 16,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ⓘ
      </button>
      {visible && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '120%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--ink)',
            color: 'var(--bg)',
            fontSize: 11,
            padding: '5px 8px',
            borderRadius: 6,
            maxWidth: 220,
            whiteSpace: 'normal',
            zIndex: 100,
            pointerEvents: 'none',
            lineHeight: 1.4,
          }}
        >
          {tip}
        </div>
      )}
    </span>
  )
}

interface NumInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  prefix?: string
  suffix?: string
}

export function NumInput({ prefix, suffix, className, id, ...props }: NumInputProps) {
  return (
    <div className="field-row">
      {prefix && <span className="muted" style={{ fontSize: 13 }}>{prefix}</span>}
      <input
        {...props}
        id={id}
        className={`field field-num ${className ?? ''}`}
        style={{ width: '100%' }}
      />
      {suffix && <span className="muted" style={{ fontSize: 13 }}>{suffix}</span>}
    </div>
  )
}

interface SegProps {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  'aria-label'?: string
}

export function Seg({ options, value, onChange, 'aria-label': ariaLabel }: SegProps) {
  return (
    <div
      className="seg"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <div
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onChange(o.value)
            }
          }}
        >
          {o.label}
        </div>
      ))}
    </div>
  )
}
