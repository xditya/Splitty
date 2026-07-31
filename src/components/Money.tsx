// PLAN.md §15.5 — every changing amount renders through NumberFlow.
// Static amounts use formatPaise; both always ₹, two decimals, tabular figures.
import NumberFlow from '@number-flow/react'
import { formatPaise, type Paise } from '../lib/money'

const INR_FORMAT = {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const

export function Money({ paise, className }: { paise: Paise; className?: string }) {
  return (
    <NumberFlow
      value={paise / 100}
      format={INR_FORMAT}
      locales="en-IN"
      className={`tabular ${className ?? ''}`}
    />
  )
}

export function MoneyStatic({ paise, className }: { paise: Paise; className?: string }) {
  return <span className={`tabular ${className ?? ''}`}>{formatPaise(paise)}</span>
}
