// PLAN.md §5 — all money is integer paise. Never float, anywhere, at any layer.

export type Paise = number

/** ₹1,412.00 — always two decimals, always ₹ (PLAN.md §15.1). */
export function formatPaise(p: Paise): string {
  const sign = p < 0 ? '-' : ''
  const abs = Math.abs(p)
  const rupees = Math.floor(abs / 100)
  const paise = abs % 100
  return `${sign}₹${rupees.toLocaleString('en-IN')}.${String(paise).padStart(2, '0')}`
}

/** Rupees as a decimal number for NumberFlow / UPI `am` param. */
export function paiseToRupees(p: Paise): number {
  return p / 100
}

/** UPI `am` value: rupees with exactly two decimals (PLAN.md §10.1). */
export function upiAmount(p: Paise): string {
  return (p / 100).toFixed(2)
}

/**
 * Parse a human/OCR money string ("1,234.56", "₹280", "234.5", "56000") into paise.
 * Returns null when nothing numeric is present.
 */
export function parseMoney(raw: string): Paise | null {
  const cleaned = raw.replace(/[₹Rs.\s]/gi, (m) => (m === '.' ? '.' : '')).replace(/,/g, '')
  const m = cleaned.match(/-?\d+(\.\d{1,2})?/)
  if (!m) return null
  const [intPart, fracPart = ''] = m[0].split('.')
  const negative = intPart.startsWith('-')
  const rupees = Math.abs(parseInt(intPart || '0', 10) || 0)
  const frac = fracPart.padEnd(2, '0').slice(0, 2)
  const paise = rupees * 100 + (parseInt(frac || '0', 10) || 0)
  return negative ? -paise : paise
}

export function sum(values: Iterable<Paise>): Paise {
  let s = 0
  for (const v of values) s += v
  return s
}
