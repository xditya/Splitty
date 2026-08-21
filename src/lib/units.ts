// Unit-share display helpers. shares[personId] holds UNITS consumed — integers
// for whole units, fractions (1/2, 1/3…) when a club shared a unit.
import type { Paise } from './money'
import type { Item } from './types'

export function gcdInt(a: number, b: number): number {
  return b === 0 ? a : gcdInt(b, a % b)
}

/** '' for exactly 1 unit; '×2' for whole; '1/2', '3/2' for fractional. */
export function unitsLabel(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.01) {
    const w = Math.round(n)
    return w === 1 ? '' : `×${w}`
  }
  for (let q = 2; q <= 12; q++) {
    const p = Math.round(n * q)
    if (p > 0 && Math.abs(n - p / q) < 0.01) {
      const g = gcdInt(p, q)
      return `${p / g}/${q / g}`
    }
  }
  return `×${n.toFixed(2)}`
}

/** Total units assigned on an item (sum of shares, float-tolerant). */
export function unitsUsed(shares: Record<string, number>): number {
  let s = 0
  for (const v of Object.values(shares)) s += v
  return s
}

/** Fully assigned = every unit accounted for (within float tolerance). */
export function fullyAssigned(shares: Record<string, number>, qty: number): boolean {
  return unitsUsed(shares) >= Math.max(1, qty) - 0.02
}

/**
 * A share as a bare value: whole units read as digits, part-units as
 * fractions. `unitsLabel` is the badge form ('' for one, '×2' for two); this
 * is the column form the portion steppers and item summaries share — 0, 1,
 * 1/2, 2 — where every row must show something and '×' would be noise.
 */
export function unitsValue(n: number): string {
  return Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : unitsLabel(n)
}

/**
 * Money nobody is on the hook for: the line totals of items with no sharer.
 *
 * Deliberately NOT pro-rata over part-assigned items. `allocate` charges an
 * item's whole line to whoever is on it, so the money on a half-assigned item
 * is already in someone's running total — calling it unclaimed would
 * contradict the totals shown beside it. This way the invariant holds:
 * every person's total plus this figure is exactly the bill.
 */
export function unclaimedTotal(items: Item[]): Paise {
  let s = 0
  for (const i of items) {
    if (!Object.values(i.shares).some((n) => n > 0)) s += i.lineTotal
  }
  return s
}
