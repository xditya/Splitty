// Share-display helpers, and the header invariant the assign screen leans on.
import { describe, expect, it } from 'vitest'
import { fullyAssigned, unclaimedTotal, unitsLabel, unitsValue } from './units'
import { computeSplit } from './split'
import { sum } from './money'
import type { Charge, Item, Person } from './types'

const person = (id: string): Person => ({ id, name: id, color: '#000' })
const item = (
  id: string,
  qty: number,
  lineTotal: number,
  shares: Record<string, number>,
): Item => ({ id, name: id, qty, lineTotal, category: 'food', confidence: 'high', shares })

describe('unitsValue', () => {
  it('shows whole units as bare digits — no × prefix, and never an empty cell', () => {
    expect(unitsValue(0)).toBe('0')
    expect(unitsValue(1)).toBe('1')
    expect(unitsValue(2)).toBe('2')
    expect(unitsValue(3)).toBe('3')
  })

  it('shows part-units as fractions', () => {
    expect(unitsValue(0.5)).toBe('1/2')
    expect(unitsValue(1.5)).toBe('3/2')
    expect(unitsValue(1 / 3)).toBe('1/3')
    expect(unitsValue(0.4)).toBe('2/5')
  })

  it('agrees with unitsLabel wherever unitsLabel says anything at all', () => {
    for (const n of [0.5, 1.5, 1 / 3, 2 / 3, 0.25]) expect(unitsValue(n)).toBe(unitsLabel(n))
  })
})

describe('unclaimedTotal', () => {
  it('counts items nobody is on', () => {
    const items = [item('a', 1, 42000, { p1: 1 }), item('b', 2, 18000, {})]
    expect(unclaimedTotal(items)).toBe(18000)
  })

  it('counts a part-assigned item as claimed — someone is already paying it', () => {
    // p1 holds 1 of 2 units, so allocate() bills p1 the whole ₹300 line.
    expect(unclaimedTotal([item('a', 2, 30000, { p1: 1 })])).toBe(0)
    expect(fullyAssigned({ p1: 1 }, 2)).toBe(false) // …while still blocking Continue
  })

  it('ignores zeroed-out shares left behind by the portion steppers', () => {
    expect(unclaimedTotal([item('a', 1, 10000, { p1: 0, p2: 0 })])).toBe(10000)
  })

  it('is zero on an empty bill', () => {
    expect(unclaimedTotal([])).toBe(0)
  })
})

describe('the assign header invariant', () => {
  it('running totals + unclaimed always equals the whole bill', () => {
    const people = [person('p1'), person('p2'), person('p3')]
    const items = [
      item('full', 1, 42000, { p1: 0.5, p2: 0.5 }),
      item('part', 3, 30001, { p3: 1 }), // odd amount: forces Hamilton remainders
      item('none', 2, 18000, {}),
      item('zeroed', 1, 12000, { p1: 0 }),
    ]
    const charges: Charge[] = [
      { id: 'gst', label: 'GST', amount: 6601, kind: 'gst', appliesTo: 'all', mode: 'proportional' },
      { id: 'tip', label: 'Tip', amount: 5000, kind: 'tip', appliesTo: 'all', mode: 'equal' },
    ]
    const split = computeSplit({ people, items, charges, payerId: null })

    const distributed = sum(people.map((p) => split.perPerson[p.id].total))
    const wholeBill = sum(items.map((i) => i.lineTotal)) + sum(charges.map((c) => c.amount))

    expect(distributed + unclaimedTotal(items)).toBe(wholeBill)
    // and the pill only ever names money that is genuinely nowhere
    expect(unclaimedTotal(items)).toBe(18000 + 12000)
  })
})
