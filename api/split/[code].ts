// Read a shared split; PATCH toggles `paid` (anyone with the code — manual,
// no payment verification implied); PUT replaces the whole split, but only
// with the creator's writeKey, and refreshes the 30-day TTL. The writeKey is
// stored inside the record and stripped from every read.
import { kv } from '@vercel/kv'

export const config = { runtime: 'edge' }

const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/
const TTL = 30 * 24 * 60 * 60

interface StoredSplit {
  paid: Record<string, boolean>
  people: { id: string }[]
  writeKey?: string
  [k: string]: unknown
}

function codeFrom(req: Request): string | null {
  const parts = new URL(req.url).pathname.split('/')
  const code = parts[parts.length - 1]?.toUpperCase() ?? ''
  return CODE_RE.test(code) ? code : null
}

export default async function handler(req: Request): Promise<Response> {
  const code = codeFrom(req)
  if (!code) return Response.json({ error: 'bad code' }, { status: 400 })
  const key = `split:${code}`

  const stored = await kv.get<string | StoredSplit>(key)
  if (!stored) return Response.json({ error: 'not found' }, { status: 404 })
  const record = (typeof stored === 'string' ? JSON.parse(stored) : stored) as StoredSplit

  if (req.method === 'GET') {
    const { writeKey: _writeKey, ...pub } = record
    return Response.json(pub)
  }

  if (req.method === 'PATCH') {
    let body: { personId?: string; paid?: boolean }
    try {
      body = await req.json()
    } catch {
      return Response.json({ error: 'bad request' }, { status: 400 })
    }
    if (!body.personId || typeof body.paid !== 'boolean') {
      return Response.json({ error: 'bad request' }, { status: 400 })
    }
    if (!record.people.some((p) => p.id === body.personId)) {
      return Response.json({ error: 'unknown person' }, { status: 400 })
    }
    record.paid = { ...record.paid, [body.personId]: body.paid }
    const ttl = await kv.ttl(key)
    await kv.set(key, JSON.stringify(record), { ex: ttl > 0 ? ttl : 24 * 60 * 60 })
    const { writeKey: _writeKey, ...pub } = record
    return Response.json(pub)
  }

  if (req.method === 'PUT') {
    let body: { writeKey?: string; split?: Record<string, unknown> }
    try {
      body = await req.json()
    } catch {
      return Response.json({ error: 'bad request' }, { status: 400 })
    }
    if (!record.writeKey || body.writeKey !== record.writeKey) {
      return Response.json({ error: 'forbidden' }, { status: 403 })
    }
    const split = body.split
    if (!split || split.v !== 1 || !Array.isArray(split.people) || (split.people as unknown[]).length > 30) {
      return Response.json({ error: 'bad split' }, { status: 400 })
    }
    const next = JSON.stringify({ ...split, payerVpa: null, code, writeKey: record.writeKey })
    if (next.length > 33_000) return Response.json({ error: 'too large' }, { status: 400 })
    await kv.set(key, next, { ex: TTL }) // an actively-updated split stays alive
    return Response.json({ ok: true })
  }

  return new Response('method not allowed', { status: 405 })
}
