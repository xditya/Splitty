// Chat-to-assignment contract: turn "Asha ate the biryani, Ben and Chitra
// shared the naan" into structured share maps. Pure module — imported by the
// browser client AND api/assign.ts. Keep dependency-free.

export interface AssignPerson {
  id: string
  name: string
}
export interface AssignItem {
  id: string
  name: string
  qty: number
  current_shares: Record<string, number>
}

export const ASSIGN_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    assignments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          item_id: { type: 'STRING' },
          shares: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                person_id: { type: 'STRING' },
                units: { type: 'NUMBER' },
              },
              required: ['person_id', 'units'],
            },
          },
        },
        required: ['item_id', 'shares'],
      },
    },
    note: { type: 'STRING', nullable: true },
  },
  required: ['assignments'],
} as const

export function assignRequestBody(
  message: string,
  people: AssignPerson[],
  items: AssignItem[],
  model?: string,
) {
  const supportsThinkingLevel = model ? /^gemini-([3-9]|\d{2,})/.test(model) : false
  const prompt = `You assign restaurant bill items to people based on a short chat message.

Context (JSON): ${JSON.stringify({ people, items })}

Rules:
- "units" are counted in the item's own qty units. A person who had one whole unit gets 1. People SHARING one unit get fractions of it (two people sharing one beer: 0.5 each).
- "everyone shared X" or "we all split X" means the item's qty divided evenly among ALL people.
- For each item the message clearly covers, output its item_id with the COMPLETE new share list (it replaces the item's current shares).
- Units for an item must sum to at most its qty; when the message accounts for the whole item, make them sum to exactly qty.
- Only mention items and people from the context, using ONLY their ids.
- Skip items the message doesn't talk about. If something is ambiguous, or names don't match anyone, say so briefly in "note" and skip that part. Never guess.

User message: ${message}`

  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: ASSIGN_RESPONSE_SCHEMA,
      temperature: 0,
      ...(supportsThinkingLevel ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
    },
  }
}

export interface RawAssign {
  assignments?: { item_id: string; shares?: { person_id: string; units: number }[] }[]
  note?: string | null
}

export interface AssignProposal {
  itemId: string
  itemName: string
  shares: Record<string, number>
}

/** Sanitize model output: known ids only, positive units, per-item total ≤ qty. */
export function validateProposals(
  raw: RawAssign,
  people: AssignPerson[],
  items: AssignItem[],
): { proposals: AssignProposal[]; note: string | null } {
  const personIds = new Set(people.map((p) => p.id))
  const itemById = new Map(items.map((i) => [i.id, i]))
  const proposals: AssignProposal[] = []
  const notes: string[] = raw.note ? [raw.note] : []

  for (const a of raw.assignments ?? []) {
    const item = itemById.get(a.item_id)
    if (!item) continue
    const shares: Record<string, number> = {}
    let total = 0
    for (const s of a.shares ?? []) {
      if (!personIds.has(s.person_id)) continue
      const units = Number(s.units)
      if (!Number.isFinite(units) || units <= 0) continue
      shares[s.person_id] = (shares[s.person_id] ?? 0) + units
      total += units
    }
    if (total <= 0) continue
    // over-assignment scales down to fit the item (money must stay exact)
    if (total > item.qty + 0.01) {
      const scale = item.qty / total
      for (const k of Object.keys(shares)) shares[k] *= scale
      notes.push(`${item.name}: scaled down to fit ${item.qty} unit${item.qty === 1 ? '' : 's'}.`)
    }
    proposals.push({ itemId: item.id, itemName: item.name, shares })
  }

  return { proposals, note: notes.length > 0 ? notes.join(' ') : null }
}
