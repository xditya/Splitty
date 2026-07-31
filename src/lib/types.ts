// PLAN.md §6 — data model.
import type { Paise } from './money'

export interface Person {
  id: string
  name: string
  color: string // from the fixed 8-colour palette, stable by index (§15.1)
}

export type Category = 'food' | 'alcohol' | 'other'
export type Confidence = 'high' | 'low'

export interface Item {
  id: string
  name: string
  qty: number
  lineTotal: Paise
  category: Category
  confidence: Confidence
  shares: Record<string, number> // personId → share count; empty = unassigned
}

export type SplitMode = 'proportional' | 'equal' | 'scoped' | 'custom'

export type ChargeKind =
  | 'gst'
  | 'vat'
  | 'service'
  | 'tip'
  | 'packaging'
  | 'delivery'
  | 'discount'
  | 'rounding'
  | 'other'

export interface Charge {
  id: string
  label: string
  amount: Paise // negative = discount
  kind: ChargeKind
  appliesTo: Category | 'all'
  mode: SplitMode
  custom?: Record<string, Paise>
}

export type EngineTag = 'gemini-user' | 'gemini-shared' | 'tesseract' | 'manual'

export interface Bill {
  id: string
  merchant: string | null
  date: string | null
  people: Person[]
  items: Item[]
  charges: Charge[]
  total: Paise // as printed on the bill (may disagree with lines — §5.1 flags, never blocks)
  payerId: string | null
  payerVpa: string | null // never persisted server-side (§10.5)
  paid: Record<string, boolean>
  engine: EngineTag
}

/** Result of a scan, engine-agnostic (§5 extraction contract, camel-cased). */
export interface ScanResult {
  merchant: string | null
  date: string | null
  items: Omit<Item, 'id' | 'shares'>[]
  charges: Omit<Charge, 'id' | 'mode'>[]
  subtotal: Paise | null
  total: Paise | null
  engine: EngineTag
}
