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
  /** Proves to the server that this device created the share — required to
      overwrite the stored split; never part of the shared URL. */
  shareWriteKey: string | null
  /** All items' shares as they were before the last share-changing action.
      Undoing swaps current↔snapshot, so undo-of-undo is redo. */
  undoSnapshot: Record<string, Record<string, number>> | null
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
  /** Set many items' shares as ONE undoable step (chat apply). */
  applyShares: (map: Record<string, Record<string, number>>) => void
  undoLast: () => void
  addCharge: (partial?: Partial<Charge>) => void
  updateCharge: (id: string, patch: Partial<Charge>) => void
  removeCharge: (id: string) => void
  setModeForKind: (kind: ChargeKind, mode: SplitMode) => void
  setPayer: (id: string | null) => void
  setPayerVpa: (vpa: string | null) => void
  markPaid: (personId: string, paid: boolean) => void
  setEngine: (e: EngineTag) => void
  setShareCode: (c: string | null, writeKey?: string | null) => void
}

export const useBill = create<BillActions>()(
  persist(
    (set, get) => ({
      step: 'home',
      activePersonIds: [],
      shareCode: null,
      shareWriteKey: null,
      undoSnapshot: null,
      bill: emptyBill(),

      setStep: (step) => set({ step }),
      newBill: () =>
        set({
          bill: emptyBill(),
          step: 'people',
          activePersonIds: [],
          shareCode: null,
          shareWriteKey: null,
          undoSnapshot: null,
        }),

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
      // Removing a person re-splits their items evenly among the remaining
      // sharers, so nothing silently becomes under-assigned.
      removePerson: (id) =>
        set((s) => ({
          bill: {
            ...s.bill,
            people: s.bill.people.filter((p) => p.id !== id),
            items: s.bill.items.map((i) => {
              if (!(i.shares[id] > 0)) {
                const shares = { ...i.shares }
                delete shares[id]
                return { ...i, shares }
              }
              const remaining = Object.keys(i.shares).filter((k) => k !== id && i.shares[k] > 0)
              const qty = Math.max(1, i.qty)
              const shares =
                remaining.length > 0
                  ? Object.fromEntries(remaining.map((k) => [k, qty / remaining.length]))
                  : {}
              return { ...i, shares }
            }),
            payerId: s.bill.payerId === id ? null : s.bill.payerId,
            paid: Object.fromEntries(Object.entries(s.bill.paid).filter(([k]) => k !== id)),
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
          // any change to shares is undoable — snapshot the pre-change state
          ...('shares' in patch
            ? { undoSnapshot: Object.fromEntries(s.bill.items.map((i) => [i.id, { ...i.shares }])) }
            : {}),
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

      // The fast path matches how people talk at a table: "we four had this"
      // → select them, tap the item, done. A tap makes the item belong to
      // EXACTLY the selected people, split evenly — a 2-qty item tapped with
      // 4 selected completes instantly at 1/2 each. Re-tapping with a
      // corrected selection replaces the mistake (and Undo covers the rest).
      // Uneven portions are the long-press sheet's job. A tap that would
      // change nothing returns 'blocked' so the UI can buzz.
      tapAssign: (itemId) => {
        const { activePersonIds, bill } = get()
        if (activePersonIds.length === 0) return 'no-selection'
        const item = bill.items.find((i) => i.id === itemId)
        if (!item) return 'blocked'
        const qty = Math.max(1, item.qty)
        const holders = Object.keys(item.shares).filter((k) => item.shares[k] > 0)
        const same =
          holders.length === activePersonIds.length &&
          activePersonIds.every(
            (id) => Math.abs((item.shares[id] ?? 0) - qty / activePersonIds.length) < 0.01,
          )
        if (same) return 'blocked'
        get().updateItem(itemId, {
          shares: Object.fromEntries(activePersonIds.map((id) => [id, qty / activePersonIds.length])),
        })
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

      applyShares: (map) =>
        set((s) => ({
          undoSnapshot: Object.fromEntries(s.bill.items.map((i) => [i.id, { ...i.shares }])),
          bill: {
            ...s.bill,
            items: s.bill.items.map((i) => (map[i.id] ? { ...i, shares: map[i.id] } : i)),
          },
        })),

      undoLast: () =>
        set((s) => {
          if (!s.undoSnapshot) return s
          return {
            // current state becomes the new snapshot: undoing twice redoes
            undoSnapshot: Object.fromEntries(s.bill.items.map((i) => [i.id, { ...i.shares }])),
            bill: {
              ...s.bill,
              items: s.bill.items.map((i) => ({ ...i, shares: s.undoSnapshot![i.id] ?? i.shares })),
            },
          }
        }),

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
      setShareCode: (shareCode, writeKey = null) => set({ shareCode, shareWriteKey: writeKey }),
    }),
    { name: 'splitty:bill' },
  ),
)
