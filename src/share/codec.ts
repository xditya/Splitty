// PLAN.md §9 — sharing. Fragment encoding first (removes KV from the critical
// path); the KV code path layers on top. We share the *computed split*, not the
// raw bill. The VPA rides only in the fragment (client→client, never a server).
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Bill } from '../lib/types'
import { computeSplit } from '../lib/split'
import type { Paise } from '../lib/money'

export interface SharedSplit {
  v: 1
  merchant: string | null
  date: string | null
  people: { id: string; name: string; color: string; total: Paise }[]
  items: { name: string; lineTotal: Paise; personIds: string[] }[]
  total: Paise
  payerId: string | null
  payerVpa: string | null // fragment shares only; stripped before any server write
  paid: Record<string, boolean>
  claimed?: Record<string, boolean> // absent on splits shared before §10.4
  code?: string
}

export function toShared(bill: Bill): SharedSplit {
  const split = computeSplit(bill)
  return {
    v: 1,
    merchant: bill.merchant,
    date: bill.date,
    people: bill.people.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      total: split.perPerson[p.id]?.total ?? 0,
    })),
    items: bill.items
      .filter((i) => Object.values(i.shares).some((s) => s > 0))
      .map((i) => ({
        name: i.name,
        lineTotal: i.lineTotal,
        personIds: Object.keys(i.shares).filter((k) => i.shares[k] > 0),
      })),
    total: split.allocatedTotal,
    payerId: bill.payerId,
    payerVpa: bill.payerVpa,
    paid: bill.paid,
    claimed: bill.claimed ?? {},
  }
}

export function encodeFragment(s: SharedSplit): string {
  return compressToEncodedURIComponent(JSON.stringify(s))
}

export function decodeFragment(frag: string): SharedSplit | null {
  try {
    const json = decompressFromEncodedURIComponent(frag)
    if (!json) return null
    const parsed = JSON.parse(json) as SharedSplit
    if (parsed.v !== 1 || !Array.isArray(parsed.people)) return null
    return parsed
  } catch {
    return null
  }
}

export function fragmentUrl(s: SharedSplit): string {
  return `${location.origin}/s#d=${encodeFragment(s)}`
}

/**
 * §10.5 — code shares strip the VPA server-side, so the Pay button would die
 * on KV links. The VPA rides in the URL *fragment* instead: fragments never
 * leave the browser, so "we don't store your payment details" stays literally
 * true while recipients still get a working Pay button.
 */
export function codeShareUrl(code: string, payerVpa: string | null): string {
  const base = `${location.origin}/s/${code}`
  return payerVpa ? `${base}#pa=${encodeURIComponent(payerVpa)}` : base
}

/** Read a `#pa=` fragment VPA on the shared view (code links). */
export function fragmentVpa(): string | null {
  const m = location.hash.match(/[#&]pa=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** §9 — server share. VPA stripped: never stored server-side (§10.5).
    The returned writeKey stays on this device and authorizes later updates. */
export async function createCodeShare(
  s: SharedSplit,
): Promise<{ code: string; writeKey: string } | null> {
  try {
    const res = await fetch('/api/split', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...s, payerVpa: null }),
    })
    if (!res.ok) return null
    return (await res.json()) as { code: string; writeKey: string }
  } catch {
    return null
  }
}

/** Overwrite the stored split under the same code ("share again" after edits). */
export async function updateCodeShare(
  code: string,
  writeKey: string,
  s: SharedSplit,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/split/${code}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ writeKey, split: { ...s, payerVpa: null } }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchCodeShare(code: string): Promise<SharedSplit | null> {
  try {
    const res = await fetch(`/api/split/${code}`)
    if (!res.ok) return null
    return (await res.json()) as SharedSplit
  } catch {
    return null
  }
}

/**
 * Push one person's settlement to the shared record. Callers send the full
 * desired pair (see lib/settle.ts `settlePatch`) so the server stays dumb and
 * the paid/claimed rule lives in exactly one place. `claimed` is optional on
 * the wire: a client that omits it leaves the stored claim untouched, which is
 * what an older cached build does.
 */
export async function patchSettle(
  code: string,
  personId: string,
  patch: { paid?: boolean; claimed?: boolean },
): Promise<boolean> {
  try {
    const res = await fetch(`/api/split/${code}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personId, ...patch }),
    })
    return res.ok
  } catch {
    return false
  }
}
