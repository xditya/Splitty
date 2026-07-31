// PLAN.md §9 — the fragment share must round-trip losslessly.
import { describe, expect, it } from 'vitest'
import { decodeFragment, encodeFragment, toShared } from './codec'
import type { Bill } from '../lib/types'

const bill: Bill = {
  id: 'b1',
  merchant: 'Café Test',
  date: '2026-07-31',
  people: [
    { id: 'a', name: 'Asha', color: '#2563eb' },
    { id: 'b', name: 'Ben', color: '#7c3aed' },
  ],
  items: [
    { id: 'i1', name: 'Dal', qty: 1, lineTotal: 20000, category: 'food', confidence: 'high', shares: { a: 1, b: 1 } },
    { id: 'i2', name: 'Beer', qty: 2, lineTotal: 50000, category: 'alcohol', confidence: 'high', shares: { b: 2 } },
  ],
  charges: [
    { id: 'c1', label: 'GST 5%', amount: 1000, kind: 'gst', appliesTo: 'all', mode: 'proportional' },
  ],
  total: 71000,
  payerId: 'a',
  payerVpa: 'asha@okbank',
  paid: { b: false },
  engine: 'manual',
}

describe('share codec (§9)', () => {
  it('computes per-person totals into the shared payload', () => {
    const s = toShared(bill)
    expect(s.people.map((p) => p.total).reduce((x, y) => x + y, 0)).toBe(71000)
    expect(s.total).toBe(71000)
  })

  it('round-trips through the URL fragment', () => {
    const s = toShared(bill)
    const decoded = decodeFragment(encodeFragment(s))
    expect(decoded).toEqual(s)
  })

  it('carries the VPA in the fragment (client→client) — server path strips it separately', () => {
    const s = toShared(bill)
    expect(s.payerVpa).toBe('asha@okbank')
  })

  it('rejects garbage fragments gracefully', () => {
    expect(decodeFragment('not-a-fragment')).toBeNull()
    expect(decodeFragment('')).toBeNull()
  })
})
