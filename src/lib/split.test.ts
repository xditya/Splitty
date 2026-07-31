// PLAN.md §7.7 — required test cases, including the fuzz run.
import { describe, expect, it } from 'vitest'
import { allocate, computeSplit, scopeOf, reconcile } from './split'
import { sum } from './money'
import type { Bill, Charge, Item, Person } from './types'

const person = (id: string): Person => ({ id, name: id, color: '#000' })
const item = (id: string, lineTotal: number, shares: Record<string, number>, extra: Partial<Item> = {}): Item => ({
  id,
  name: id,
  qty: 1,
  lineTotal,
  category: 'food',
  confidence: 'high',
  shares,
  ...extra,
})
const charge = (id: string, amount: number, extra: Partial<Charge> = {}): Charge => ({
  id,
  label: id,
  amount,
  kind: 'other',
  appliesTo: 'all',
  mode: 'equal',
  ...extra,
})

const bill = (people: Person[], items: Item[], charges: Charge[], payerId: string | null = null) =>
  ({ people, items, charges, payerId }) as Pick<Bill, 'people' | 'items' | 'charges' | 'payerId'>

describe('allocate (§7.1)', () => {
  it('₹100 across 3 people → 3334/3333/3333, sums to 10000', () => {
    const out = allocate(10000, { a: 1, b: 1, c: 1 })
    expect(sum(Object.values(out))).toBe(10000)
    expect(Object.values(out).sort((x, y) => y - x)).toEqual([3334, 3333, 3333])
  })

  it('is deterministic — ties break by ascending key', () => {
    const a = allocate(10000, { c: 1, a: 1, b: 1 })
    const b = allocate(10000, { a: 1, b: 1, c: 1 })
    expect(a).toEqual(b)
    expect(a.a).toBe(3334) // first key gets the remainder paisa
  })

  it('single person → exact', () => {
    expect(allocate(4242, { solo: 1 })).toEqual({ solo: 4242 })
  })

  it('negative amount (discount) sums to the negative total', () => {
    const out = allocate(-1001, { a: 1, b: 1, c: 1 })
    expect(sum(Object.values(out))).toBe(-1001)
  })

  it('qty-3 item shared 2:1 → exact 2/3 and 1/3', () => {
    const out = allocate(9000, { a: 2, b: 1 })
    expect(out).toEqual({ a: 6000, b: 3000 })
    const uneven = allocate(10000, { a: 2, b: 1 })
    expect(sum(Object.values(uneven))).toBe(10000)
    expect(uneven.a).toBe(6667)
    expect(uneven.b).toBe(3333)
  })

  it('zero total weight → all zeros', () => {
    expect(allocate(5000, { a: 0, b: 0 })).toEqual({ a: 0, b: 0 })
  })

  it('fractional unit-weights (club shares) still sum exactly', () => {
    // qty-3 drink at ₹300: A+B share one unit (1/2 each), C and D one each
    const out = allocate(30000, { a: 0.5, b: 0.5, c: 1, d: 1 })
    expect(sum(Object.values(out))).toBe(30000)
    expect(out.a).toBe(5000)
    expect(out.b).toBe(5000)
    expect(out.c).toBe(10000)
    expect(out.d).toBe(10000)
    // thirds don't divide evenly in paise — must still sum exactly
    const thirds = allocate(10000, { a: 1 / 3, b: 1 / 3, c: 1 / 3 })
    expect(sum(Object.values(thirds))).toBe(10000)
  })
})

describe('computeSplit (§7.2–7.6)', () => {
  it('single item, single person → exact', () => {
    const r = computeSplit(bill([person('a')], [item('i1', 28000, { a: 1 })], []))
    expect(r.perPerson.a.total).toBe(28000)
    expect(r.invariantOk).toBe(true)
  })

  it('alcohol VAT with 2 of 5 drinkers → non-drinkers get 0 (§7.3)', () => {
    const people = ['a', 'b', 'c', 'd', 'e'].map(person)
    const items = [
      item('food1', 50000, { a: 1, b: 1, c: 1, d: 1, e: 1 }),
      item('beer', 40000, { a: 1, b: 1 }, { category: 'alcohol' }),
    ]
    const vat = charge('vat', 8000, { kind: 'vat', appliesTo: 'alcohol', mode: 'scoped' })
    const r = computeSplit(bill(people, items, [vat]))
    expect(r.perPerson.c.charges.vat ?? 0).toBe(0)
    expect(r.perPerson.d.charges.vat ?? 0).toBe(0)
    expect(r.perPerson.e.charges.vat ?? 0).toBe(0)
    expect((r.perPerson.a.charges.vat ?? 0) + (r.perPerson.b.charges.vat ?? 0)).toBe(8000)
    expect(r.invariantOk).toBe(true)
  })

  it('discount (negative charge) across 3 sums to the negative total', () => {
    const people = ['a', 'b', 'c'].map(person)
    const items = [item('i', 30000, { a: 1, b: 1, c: 1 })]
    const r = computeSplit(bill(people, items, [charge('disc', -5000, { kind: 'discount', mode: 'proportional' })]))
    const total = sum(Object.values(r.perPerson).map((p) => p.charges.disc ?? 0))
    expect(total).toBe(-5000)
    expect(r.invariantOk).toBe(true)
  })

  it('all charges equal, prime number of people → still exact', () => {
    const people = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(person)
    const items = [item('i', 77777, Object.fromEntries(people.map((p) => [p.id, 1])))]
    const charges = [charge('c1', 10001), charge('c2', 999), charge('c3', 3)]
    const r = computeSplit(bill(people, items, charges))
    expect(r.invariantOk).toBe(true)
    expect(sum(Object.values(r.perPerson).map((p) => p.total))).toBe(77777 + 10001 + 999 + 3)
  })

  it('empty scope degrades to all people, still exact (§7.3)', () => {
    const people = ['a', 'b'].map(person)
    const items = [item('i', 10000, { a: 1, b: 1 })] // food only
    const vat = charge('vat', 999, { kind: 'vat', appliesTo: 'alcohol', mode: 'scoped' })
    const r = computeSplit(bill(people, items, [vat]))
    expect(sum(Object.values(r.perPerson).map((p) => p.charges.vat ?? 0))).toBe(999)
    expect(r.invariantOk).toBe(true)
  })

  it('rounding charge goes entirely to the payer (§7.5)', () => {
    const people = ['a', 'b'].map(person)
    const items = [item('i', 10000, { a: 1, b: 1 })]
    const r = computeSplit(bill(people, items, [charge('r', 37, { kind: 'rounding' })], 'b'))
    expect(r.perPerson.b.charges.r).toBe(37)
    expect(r.perPerson.a.charges.r ?? 0).toBe(0)
  })

  it('proportional charge weights by scoped subtotal', () => {
    const people = ['a', 'b'].map(person)
    const items = [item('i1', 30000, { a: 1 }), item('i2', 10000, { b: 1 })]
    const gst = charge('gst', 2000, { kind: 'gst', mode: 'proportional' })
    const r = computeSplit(bill(people, items, [gst]))
    expect(r.perPerson.a.charges.gst).toBe(1500)
    expect(r.perPerson.b.charges.gst).toBe(500)
  })

  it('custom mode that does not sum degrades to equal, keeps invariant', () => {
    const people = ['a', 'b'].map(person)
    const items = [item('i', 10000, { a: 1, b: 1 })]
    const c = charge('c', 1000, { mode: 'custom', custom: { a: 999 } }) // wrong sum
    const r = computeSplit(bill(people, items, [c]))
    expect(sum(Object.values(r.perPerson).map((p) => p.charges.c ?? 0))).toBe(1000)
    expect(r.invariantOk).toBe(true)
  })

  it('unassigned items are excluded and reported', () => {
    const people = ['a'].map(person)
    const items = [item('done', 5000, { a: 1 }), item('todo', 7000, {})]
    const r = computeSplit(bill(people, items, []))
    expect(r.unassignedItemIds).toEqual(['todo'])
    expect(r.allocatedTotal).toBe(5000)
  })

  it('fuzz: 20 items × 8 people, randomised shares, 1000 runs → invariant always holds (§7.7)', () => {
    let seed = 424242
    const rnd = () => {
      // xorshift32 — deterministic fuzz
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return (seed >>> 0) / 0xffffffff
    }
    const modes = ['equal', 'proportional', 'scoped'] as const
    const cats = ['food', 'alcohol', 'other'] as const

    for (let run = 0; run < 1000; run++) {
      const people = Array.from({ length: 8 }, (_, i) => person(`p${i}`))
      const items: Item[] = Array.from({ length: 20 }, (_, i) => {
        const shares: Record<string, number> = {}
        for (const p of people) if (rnd() < 0.4) shares[p.id] = 1 + Math.floor(rnd() * 3)
        return item(`i${i}`, 1 + Math.floor(rnd() * 100000), shares, {
          category: cats[Math.floor(rnd() * 3)],
        })
      })
      const charges: Charge[] = Array.from({ length: 4 }, (_, i) =>
        charge(`c${i}`, Math.floor(rnd() * 20000) - 5000, {
          appliesTo: rnd() < 0.3 ? 'alcohol' : 'all',
          mode: modes[Math.floor(rnd() * 3)],
        }),
      )
      const r = computeSplit(bill(people, items, charges))
      expect(r.invariantOk).toBe(true)
    }
  })
})

describe('scopeOf (§7.3)', () => {
  it('scopes to people holding items of the category', () => {
    const people = ['a', 'b', 'c'].map(person)
    const items = [item('beer', 1000, { a: 1, c: 1 }, { category: 'alcohol' })]
    const c = charge('vat', 100, { appliesTo: 'alcohol' })
    expect(scopeOf(c, items, people)).toEqual(['a', 'c'])
  })
})

describe('reconcile (§5.1)', () => {
  it('flags a gap beyond ₹1, tolerates within', () => {
    const items = [item('i', 141200, { a: 1 })]
    expect(reconcile(items, [], 142600).mismatch).toBe(true)
    expect(reconcile(items, [], 141250).mismatch).toBe(false)
    expect(reconcile(items, [], null).mismatch).toBe(false)
  })
})
