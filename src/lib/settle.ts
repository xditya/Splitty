// PLAN.md §10.4 — settlement state. A UPI intent link is fire-and-forget: the
// confirmation goes to the payee's bank, never back to this page, so the app
// can never *detect* a payment. What it can do is stop conflating two very
// different claims — "I sent it" and "I got it" — which is what a single
// boolean did.
//
// Three states, and only the payer can reach the last one:
//   pending   — nobody has said anything
//   claimed   — the person who owes says they have sent it
//   confirmed — the person who fronted the bill says it arrived
//
// `paid` keeps its original meaning (confirmed), so every older split, every
// stored KV record and every history snapshot reads correctly with no
// migration: they simply carry no claims.

export type SettleState = 'pending' | 'claimed' | 'confirmed'

type Flags = Record<string, boolean> | undefined

/** The payer settles by definition — they are the one owed. */
export function settleState(
  personId: string,
  payerId: string | null,
  paid: Flags,
  claimed?: Flags, // optional: a pre-§10.4 split simply has no claims
): SettleState {
  if (personId === payerId) return 'confirmed'
  if (paid?.[personId]) return 'confirmed'
  if (claimed?.[personId]) return 'claimed'
  return 'pending'
}

/**
 * Confirming supersedes a claim, so the two flags never both stand. Callers
 * send the full desired pair rather than letting the store and the server
 * each invent a rule — there is one place that decides, and this is it.
 */
export function settlePatch(next: SettleState): { paid: boolean; claimed: boolean } {
  switch (next) {
    case 'confirmed':
      return { paid: true, claimed: false }
    case 'claimed':
      return { paid: false, claimed: true }
    default:
      return { paid: false, claimed: false }
  }
}
