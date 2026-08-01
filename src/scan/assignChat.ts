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
    if (!res.ok) throw new Error(`AI request failed (HTTP ${res.status})`)
    raw = (await res.json()) as RawAssign
  }
  return validateProposals(raw, people, items)
}
