// PLAN.md §9 — create a shared split. Stores the computed split only: no image,
// no VPA (stripped again server-side for §10.5), no IPs. 30-day TTL.
import { kv } from '@vercel/kv'

export const config = { runtime: 'edge' }

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ' // no 0/O/1/I/L/U
const TTL = 30 * 24 * 60 * 60

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 })
  }
  if (body.v !== 1 || !Array.isArray(body.people) || (body.people as unknown[]).length > 30) {
    return Response.json({ error: 'bad split' }, { status: 400 })
  }
  const raw = JSON.stringify({ ...body, payerVpa: null }) // §10.5 — VPA never reaches KV
  if (raw.length > 32_000) return Response.json({ error: 'too large' }, { status: 400 })

  // nx + retry on collision (§9)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    const ok = await kv.set(`split:${code}`, raw, { nx: true, ex: TTL })
    if (ok) {
      await kv.set(`split:${code}`, JSON.stringify({ ...JSON.parse(raw), code }), { ex: TTL })
      return Response.json({ code })
    }
  }
  return Response.json({ error: 'collision' }, { status: 503 })
}
