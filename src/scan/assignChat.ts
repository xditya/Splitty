// Browser client for chat-to-assignment: user key goes straight to Google
// (same privacy story as scanning), otherwise the shared proxy.
import { getUserKey, useSettings } from '../store/settings'
import { parseGeminiResponse } from './contract'
import {
  assignRequestBody,
  validateProposals,
  type AssignItem,
  type AssignPerson,
  type AssignProposal,
  type RawAssign,
} from './assignContract'
import type { Bill } from '../lib/types'

export async function chatAssign(
  message: string,
  bill: Pick<Bill, 'people' | 'items'>,
): Promise<{ proposals: AssignProposal[]; note: string | null }> {
  const people: AssignPerson[] = bill.people.map((p) => ({ id: p.id, name: p.name }))
  const items: AssignItem[] = bill.items.map((i) => ({
    id: i.id,
    name: i.name,
    qty: Math.max(1, i.qty),
    current_shares: i.shares,
  }))

  const key = getUserKey()
  let raw: RawAssign
  if (key) {
    const { model } = useSettings.getState()
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(assignRequestBody(message, people, items, model)),
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (!res.ok) throw new Error(`AI request failed (HTTP ${res.status})`)
    raw = parseGeminiResponse(await res.json()) as RawAssign
  } else {
    const res = await fetch('/api/assign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, people, items }),
      signal: AbortSignal.timeout(30_000),
    })
    // a static host (local preview) has no /api — surface that as its own
    // case so the UI can point at the BYOK fix instead of a vague failure
    if (res.status === 404 || res.status === 405) throw new Error('no-backend')
    if (res.status === 429) throw new Error('busy')
    if (!res.ok) throw new Error(`AI request failed (HTTP ${res.status})`)
    if (!(res.headers.get('content-type') ?? '').includes('json')) throw new Error('no-backend')
    raw = (await res.json()) as RawAssign
  }
  return validateProposals(raw, people, items)
}
