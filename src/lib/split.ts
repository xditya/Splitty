// PLAN.md §7 — the split engine. Pure functions, no React, fully unit-tested.
// Every rupee division in the app goes through allocate(); that is what
// guarantees the §7.6 invariant: parts always sum to exactly the input.

import { sum, type Paise } from './money'
import type { Bill, Charge, ChargeKind, Item, Person, SplitMode } from './types'

/**
 * Split `amount` across weights so the parts sum to EXACTLY `amount`.
 * Hamilton / largest-remainder method (§7.1). Deterministic: ties break by
 * ascending key, so the same input always gives the same output.
 * Negative amounts (discounts) allocate on the absolute value, sign re-applied.
 */
export function allocate(amount: Paise, weights: Record<string, number>): Record<string, Paise> {
  if (!Number.isInteger(amount)) throw new Error('allocate: amount must be integer paise')
  if (amount < 0) {
    const pos = allocate(-amount, weights)
    return Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, -v]))
  }

  const keys = Object.keys(weights).sort()
  const totalWeight = keys.reduce((s, k) => s + weights[k], 0)
  if (totalWeight === 0) return Object.fromEntries(keys.map((k) => [k, 0]))

  const exact = keys.map((k) => (amount * weights[k]) / totalWeight)
  const floors = exact.map(Math.floor)
  const remainder = amount - floors.reduce((a, b) => a + b, 0)

  const order = keys
    .map((_, i) => ({ i, frac: exact[i] - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  const out = [...floors]
  for (let n = 0; n < remainder; n++) out[order[n % keys.length].i] += 1

  return Object.fromEntries(keys.map((k, i) => [k, out[i]]))
}

/** §7.3 — the set of people a charge can be divided among. Empty scope → all (invariant over nuance). */
export function scopeOf(charge: Charge, items: Item[], people: Person[]): string[] {
  const all = people.map((p) => p.id)
  if (charge.appliesTo === 'all') return all
  const scoped = people
    .filter((p) => items.some((i) => i.category === charge.appliesTo && (i.shares[p.id] ?? 0) > 0))
    .map((p) => p.id)
  return scoped.length > 0 ? scoped : all
}

/** §7.5 — default mode per charge kind. */
export function defaultMode(kind: ChargeKind, anyAlcohol: boolean): SplitMode {
  switch (kind) {
    case 'vat':
      return anyAlcohol ? 'scoped' : 'proportional'
    case 'packaging':
    case 'delivery':
      return 'equal'
    default:
      return 'proportional' // gst, service, tip, discount, other; rounding handled specially
  }
}

export interface PersonBreakdown {
  itemsSubtotal: Paise
  charges: Record<string, Paise> // chargeId → this person's share
  total: Paise
}

export interface SplitResult {
  perPerson: Record<string, PersonBreakdown>
  /** Sum of everything actually allocated: assigned lines + all charges. */
  allocatedTotal: Paise
  /** §7.6 — must always be true. If false there is a bug in allocate(). */
  invariantOk: boolean
  unassignedItemIds: string[]
}

function scopedItemSubtotal(
  personId: string,
  charge: Charge,
  items: Item[],
  perItemParts: Map<string, Record<string, Paise>>,
): Paise {
  let s = 0
  for (const item of items) {
    if (charge.appliesTo !== 'all' && item.category !== charge.appliesTo) continue
    s += perItemParts.get(item.id)?.[personId] ?? 0
  }
  return s
}

/** §7.2–§7.4 — full recompute. Unassigned items are excluded (they block completion in the UI). */
export function computeSplit(bill: Pick<Bill, 'people' | 'items' | 'charges' | 'payerId'>): SplitResult {
  const { people, items, charges, payerId } = bill
  const perPerson: Record<string, PersonBreakdown> = Object.fromEntries(
    people.map((p) => [p.id, { itemsSubtotal: 0, charges: {}, total: 0 }]),
  )

  const assigned = items.filter((i) => Object.values(i.shares).some((s) => s > 0))
  const unassignedItemIds = items
    .filter((i) => !Object.values(i.shares).some((s) => s > 0))
    .map((i) => i.id)

  // §7.2 — item subtotals
  const perItemParts = new Map<string, Record<string, Paise>>()
  for (const item of assigned) {
    const parts = allocate(item.lineTotal, item.shares)
    perItemParts.set(item.id, parts)
    for (const [pid, v] of Object.entries(parts)) {
      if (perPerson[pid]) perPerson[pid].itemsSubtotal += v
    }
  }

  // §7.4 — charges by mode
  for (const charge of charges) {
    const scope = scopeOf(charge, assigned, people)
    let parts: Record<string, Paise>

    if (charge.kind === 'rounding' && payerId && perPerson[payerId]) {
      // §7.5 — rounding goes entirely to the payer
      parts = { [payerId]: charge.amount }
    } else if (charge.mode === 'custom' && charge.custom) {
      const customSum = sum(Object.values(charge.custom))
      // validate: custom must sum to the charge; otherwise degrade to equal
      parts =
        customSum === charge.amount
          ? charge.custom
          : allocate(charge.amount, Object.fromEntries(scope.map((id) => [id, 1])))
    } else if (charge.mode === 'equal') {
      parts = allocate(charge.amount, Object.fromEntries(scope.map((id) => [id, 1])))
    } else {
      // proportional / scoped share an implementation (§7.4)
      let weights = Object.fromEntries(
        scope.map((id) => [id, scopedItemSubtotal(id, charge, assigned, perItemParts)]),
      )
      if (Object.values(weights).every((w) => w === 0)) {
        weights = Object.fromEntries(scope.map((id) => [id, 1])) // degrade to equal
      }
      parts = allocate(charge.amount, weights)
    }

    for (const [pid, v] of Object.entries(parts)) {
      if (!perPerson[pid]) continue
      perPerson[pid].charges[charge.id] = (perPerson[pid].charges[charge.id] ?? 0) + v
    }
  }

  for (const p of Object.values(perPerson)) {
    p.total = p.itemsSubtotal + sum(Object.values(p.charges))
  }

  const allocatedTotal =
    sum(assigned.map((i) => i.lineTotal)) + sum(charges.map((c) => c.amount))
  const distributed = sum(Object.values(perPerson).map((p) => p.total))
  const invariantOk = distributed === allocatedTotal

  if (!invariantOk && import.meta.env?.DEV) {
    // §7.6 — in dev, throw. Never patch by nudging a number.
    throw new Error(`INVARIANT VIOLATED: distributed ${distributed} !== allocated ${allocatedTotal}`)
  }

  return { perPerson, allocatedTotal, invariantOk, unassignedItemIds }
}

/** §5.1 — reconciliation: do the lines + charges match the printed total? ₹1 tolerance. */
export function reconcile(items: Item[], charges: Charge[], printedTotal: Paise | null) {
  const computed = sum(items.map((i) => i.lineTotal)) + sum(charges.map((c) => c.amount))
  if (printedTotal == null) return { computed, gap: 0, mismatch: false }
  const gap = printedTotal - computed
  return { computed, gap, mismatch: Math.abs(gap) > 100 }
}
