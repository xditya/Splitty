// PLAN.md §6 (model), §8 (assignment interactions). Persisted so a refresh
// at the table never loses the bill (§1 "never broken").
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { Bill, Category, Charge, ChargeKind, EngineTag, Item, ScanResult, SplitMode } from '../lib/types'
import { colorForIndex } from '../lib/palette'
import { defaultMode } from '../lib/split'
import { useSettings } from './settings'

export type Step = 'home' | 'people' | 'items' | 'assign' | 'charges' | 'summary'

function emptyBill(): Bill {
  return {
    id: nanoid(8),
    merchant: null,
    date: null,
    people: [],
    items: [],
    charges: [],
    total: 0,
    payerId: null,
    payerVpa: null,
    paid: {},
    engine: 'manual',
  }
}

interface BillActions {
  step: Step
  /**
   * §8 — the assignment "brush": the set of people the next item-tap assigns
   * to. One person = solo fast path; several = clubbed group (A+B, A+C, …);
   * all = shared appetiser.
   */
  activePersonIds: string[]
  shareCode: string | null
  bill: Bill
  setStep: (s: Step) => void
  newBill: () => void
  loadScan: (r: ScanResult) => void
  addPerson: (name: string) => void
  removePerson: (id: string) => void
  addItem: (partial?: Partial<Item>) => void
  updateItem: (id: string, patch: Partial<Item>) => void
  removeItem: (id: string) => void
  setBillTotal: (t: number) => void
  setMerchant: (m: string) => void
  togglePerson: (id: string) => void
  selectOnly: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  tapAssign: (itemId: string) => 'assigned' | 'blocked' | 'no-selection'
  clearShares: (itemId: string) => void
  splitEvenly: (itemId: string, personIds: string[]) => void
  addCharge: (partial?: Partial<Charge>) => void
  updateCharge: (id: string, patch: Partial<Charge>) => void
  removeCharge: (id: string) => void
  setModeForKind: (kind: ChargeKind, mode: SplitMode) => void
  setPayer: (id: string | null) => void
  setPayerVpa: (vpa: string | null) => void
  markPaid: (personId: string, paid: boolean) => void
  setEngine: (e: EngineTag) => void
  setShareCode: (c: string | null) => void
}

export const useBill = create<BillActions>()(
  persist(
    (set, get) => ({
      step: 'home',
      activePersonIds: [],
      shareCode: null,
      bill: emptyBill(),

      setStep: (step) => set({ step }),
      newBill: () => set({ bill: emptyBill(), step: 'people', activePersonIds: [], shareCode: null }),

      // §4.3/§5 — a scan result replaces items+charges, keeps people
      loadScan: (r) => {
        const { chargeModeDefaults } = useSettings.getState()
        const anyAlcohol = r.items.some((i) => i.category === 'alcohol')
        const items: Item[] = r.items.map((i) => ({ ...i, id: nanoid(6), shares: {} }))
        const charges: Charge[] = r.charges.map((c) => ({
          ...c,
          id: nanoid(6),
          mode: chargeModeDefaults[c.kind] ?? defaultMode(c.kind, anyAlcohol),
        }))
        set((s) => ({
          bill: {
            ...s.bill,
            merchant: r.merchant,
            date: r.date,
            items,
            charges,
            total: r.total ?? 0,
            engine: r.engine,
          },
          step: s.bill.people.length > 0 ? 'items' : 'people',
        }))
      },

      addPerson: (name) =>
        set((s) => {
          const p = { id: nanoid(6), name: name.trim(), color: colorForIndex(s.bill.people.length) }
          return { bill: { ...s.bill, people: [...s.bill.people, p] } }
        }),
      removePerson: (id) =>
        set((s) => ({
          bill: {
            ...s.bill,
            people: s.bill.people.filter((p) => p.id !== id),
            items: s.bill.items.map((i) => {
              const shares = { ...i.shares }
              delete shares[id]
              return { ...i, shares }
            }),
            payerId: s.bill.payerId === id ? null : s.bill.payerId,
          },
          activePersonIds: s.activePersonIds.filter((x) => x !== id),
        })),

      addItem: (partial = {}) =>
        set((s) => ({
          bill: {
            ...s.bill,
            items: [
              ...s.bill.items,
              {
                id: nanoid(6),
                name: '',
                qty: 1,
                lineTotal: 0,
                category: 'food' as Category,
                confidence: 'high' as const,
                shares: {},
                ...partial,
              },
            ],
          },
        })),
      updateItem: (id, patch) =>
        set((s) => ({
          bill: { ...s.bill, items: s.bill.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) },
        })),
      removeItem: (id) =>
        set((s) => ({ bill: { ...s.bill, items: s.bill.items.filter((i) => i.id !== id) } })),
      setBillTotal: (total) => set((s) => ({ bill: { ...s.bill, total } })),
      setMerchant: (merchant) => set((s) => ({ bill: { ...s.bill, merchant } })),

      togglePerson: (id) =>
        set((s) => ({
          activePersonIds: s.activePersonIds.includes(id)
            ? s.activePersonIds.filter((x) => x !== id)
            : [...s.activePersonIds, id],
        })),
      selectOnly: (id) => set({ activePersonIds: [id] }),
      selectAll: () => set((s) => ({ activePersonIds: s.bill.people.map((p) => p.id) })),
      clearSelection: () => set({ activePersonIds: [] }),

      // §8 — the fast path, unit-based: shares hold UNITS consumed. One tap =
      // "the selected brush took ONE more unit of this item". A solo brush
      // takes a whole unit; a club of k people shares one unit (1/k each) —
      // so qty-3 drinks can be A+B on one, C on one, D on one. The only cap
      // is physical: you can't assign more units than the item has. Blocked
      // taps return 'blocked' so the UI can buzz/shake, never silently no-op.
      tapAssign: (itemId) => {
        const { activePersonIds, bill } = get()
        if (activePersonIds.length === 0) return 'no-selection'
        const item = bill.items.find((i) => i.id === itemId)
        if (!item) return 'blocked'
        const qty = Math.max(1, item.qty)
        const shares = { ...item.shares }
        const used = Object.values(shares).reduce((a, b) => a + b, 0)
        if (used + 1 > qty + 0.001) return 'blocked' // no unit left to give
        const k = activePersonIds.length
        for (const pid of activePersonIds) {
          shares[pid] = (shares[pid] ?? 0) + 1 / k
        }
        get().updateItem(itemId, { shares })
        return 'assigned'
      },
      clearShares: (itemId) => get().updateItem(itemId, { shares: {} }),
      // Sheet action: the WHOLE item (all units) split evenly — any number of
      // people, each gets qty/k units. 2 pizzas among 5 → 0.4 units each.
      splitEvenly: (itemId, personIds) => {
        const item = get().bill.items.find((i) => i.id === itemId)
        if (!item || personIds.length === 0) return
        const per = Math.max(1, item.qty) / personIds.length
        get().updateItem(itemId, { shares: Object.fromEntries(personIds.map((id) => [id, per])) })
      },

      addCharge: (partial = {}) =>
        set((s) => ({
          bill: {
            ...s.bill,
            charges: [
              ...s.bill.charges,
              {
                id: nanoid(6),
                label: '',
                amount: 0,
                kind: 'other' as ChargeKind,
                appliesTo: 'all' as const,
                mode: 'proportional' as SplitMode,
                ...partial,
              },
            ],
          },
        })),
      updateCharge: (id, patch) =>
        set((s) => ({
          bill: { ...s.bill, charges: s.bill.charges.map((c) => (c.id === id ? { ...c, ...patch } : c)) },
        })),
      removeCharge: (id) =>
        set((s) => ({ bill: { ...s.bill, charges: s.bill.charges.filter((c) => c.id !== id) } })),

      // §8 — CGST+SGST collapse: one decision applies to every charge of the kind.
      // §7.5 — remember the override as this device's default.
      setModeForKind: (kind, mode) => {
        useSettings.getState().rememberChargeMode(kind, mode)
        set((s) => ({
          bill: {
            ...s.bill,
            charges: s.bill.charges.map((c) => (c.kind === kind ? { ...c, mode } : c)),
          },
        }))
      },

      setPayer: (payerId) => set((s) => ({ bill: { ...s.bill, payerId } })),
      setPayerVpa: (payerVpa) => set((s) => ({ bill: { ...s.bill, payerVpa } })),
      markPaid: (personId, paid) =>
        set((s) => ({ bill: { ...s.bill, paid: { ...s.bill.paid, [personId]: paid } } })),
      setEngine: (engine) => set((s) => ({ bill: { ...s.bill, engine } })),
      setShareCode: (shareCode) => set({ shareCode }),
    }),
    { name: 'splitty:bill' },
  ),
)
