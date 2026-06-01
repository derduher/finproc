import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MoneyInput } from './MoneyInput'

function Stateful({ initial, step, spy }: { initial: number; step?: number; spy: (n: number) => void }) {
  const [v, setV] = useState(initial)
  return (
    <MoneyInput
      aria-label="amt"
      value={v}
      step={step}
      onChange={(n) => {
        setV(n)
        spy(n)
      }}
    />
  )
}

describe('MoneyInput — display', () => {
  it('renders the numeric value with locale separators', () => {
    render(<MoneyInput aria-label="amt" value={150000} onChange={vi.fn()} />)
    const input = screen.getByLabelText('amt') as HTMLInputElement
    expect(input.value).toBe('150,000')
  })

  it('renders empty string for zero when allowEmptyForZero is true', () => {
    render(<MoneyInput aria-label="amt" value={0} onChange={vi.fn()} allowEmptyForZero />)
    const input = screen.getByLabelText('amt') as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('renders "0" for zero by default', () => {
    render(<MoneyInput aria-label="amt" value={0} onChange={vi.fn()} />)
    const input = screen.getByLabelText('amt') as HTMLInputElement
    expect(input.value).toBe('0')
  })
})

describe('MoneyInput — typing', () => {
  it('strips commas and non-digits and calls onChange with a number', () => {
    const onChange = vi.fn()
    render(<MoneyInput aria-label="amt" value={0} onChange={onChange} />)
    const input = screen.getByLabelText('amt') as HTMLInputElement
    fireEvent.change(input, { target: { value: '200,000' } })
    expect(onChange).toHaveBeenLastCalledWith(200000)
  })

  it('typing plain digits still works', () => {
    const onChange = vi.fn()
    render(<MoneyInput aria-label="amt" value={0} onChange={onChange} />)
    const input = screen.getByLabelText('amt') as HTMLInputElement
    fireEvent.change(input, { target: { value: '500000' } })
    expect(onChange).toHaveBeenLastCalledWith(500000)
  })

  it('clearing the input calls onChange with 0', () => {
    const onChange = vi.fn()
    render(<MoneyInput aria-label="amt" value={150000} onChange={onChange} />)
    const input = screen.getByLabelText('amt') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(0)
  })
})

describe('MoneyInput — step snapping', () => {
  it('snaps to nearest step on blur when step is provided', () => {
    const spy = vi.fn()
    render(<Stateful initial={0} step={1000} spy={spy} />)
    const input = screen.getByLabelText('amt') as HTMLInputElement
    fireEvent.change(input, { target: { value: '12345' } })
    expect(spy).toHaveBeenLastCalledWith(12345)
    fireEvent.blur(input)
    expect(spy).toHaveBeenLastCalledWith(12000)
  })

  it('does not snap when no step provided', () => {
    const spy = vi.fn()
    render(<Stateful initial={0} spy={spy} />)
    const input = screen.getByLabelText('amt') as HTMLInputElement
    fireEvent.change(input, { target: { value: '12345' } })
    fireEvent.blur(input)
    expect(spy).toHaveBeenLastCalledWith(12345)
  })
})

describe('MoneyInput — accessibility', () => {
  it('uses inputMode="numeric" so mobile shows a numeric keypad', () => {
    render(<MoneyInput aria-label="amt" value={0} onChange={vi.fn()} />)
    const input = screen.getByLabelText('amt') as HTMLInputElement
    expect(input.inputMode).toBe('numeric')
  })
})
