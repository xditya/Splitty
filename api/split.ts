// Create a shared split. Stores the computed split only: no image, no VPA
// (stripped server-side), no IPs. 30-day TTL.
// The response includes a writeKey known only to the creator's device — it is
// required to overwrite the split later (PUT), so holders of the 6-char code
// can read and toggle paid, but never rewrite amounts.
import { kv } from '@vercel/kv'

export const config = { runtime: 'edge' }

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ' // no 0/O/1/I/L/U
const TTL = 30 * 24 * 60 * 60

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

function randomWriteKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
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

  // nx + retry on collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    const writeKey = randomWriteKey()
    const record = JSON.stringify({ ...body, payerVpa: null, code, writeKey })
    if (record.length > 33_000) return Response.json({ error: 'too large' }, { status: 400 })
    const ok = await kv.set(`split:${code}`, record, { nx: true, ex: TTL })
    if (ok) return Response.json({ code, writeKey })
  }
  return Response.json({ error: 'collision' }, { status: 503 })
}
