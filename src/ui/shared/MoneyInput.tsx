import { type ComponentProps } from 'react'

type InputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'step'>

interface Props extends InputProps {
  /** Numeric value (dollars). */
  value: number
  /** Called with the parsed numeric value. */
  onChange: (value: number) => void
  /** If set, snap to nearest multiple of `step` on blur (e.g. 1000). */
  step?: number
  /** Display empty string when value is 0 (useful for placeholder-style inputs). */
  allowEmptyForZero?: boolean
}

/**
 * MoneyInput — controlled text input that displays whole-dollar amounts with
 * locale separators (e.g. "1,000") and parses back to a number on change.
 *
 * Uses `<input type="text" inputMode="numeric">` rather than `type="number"` so
 * the displayed value can include commas. Stripped of non-digits before parsing.
 *
 * Pair with `step={1000}` to snap to the nearest thousand on blur for fields
 * like account balances where finer granularity is meaningless.
 */
export function MoneyInput({ value, onChange, step, allowEmptyForZero, ...rest }: Props) {
  const display = allowEmptyForZero && value === 0 ? '' : value.toLocaleString('en-US')

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      {...rest}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, '')
        const n = raw === '' ? 0 : Number(raw)
        if (Number.isFinite(n)) onChange(n)
      }}
      onBlur={(e) => {
        if (step && step > 0 && value > 0) {
          const snapped = Math.round(value / step) * step
          if (snapped !== value) onChange(snapped)
        }
        rest.onBlur?.(e)
      }}
    />
  )
}
