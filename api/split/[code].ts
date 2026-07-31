// PLAN.md §9 — read a shared split; PATCH toggles `paid`, the only mutable
// field (§10.4 — manual, no payment verification implied).
import { kv } from '@vercel/kv'

export const config = { runtime: 'edge' }

const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/

function codeFrom(req: Request): string | null {
  const parts = new URL(req.url).pathname.split('/')
  const code = parts[parts.length - 1]?.toUpperCase() ?? ''
  return CODE_RE.test(code) ? code : null
}

export default async function handler(req: Request): Promise<Response> {
  const code = codeFrom(req)
  if (!code) return Response.json({ error: 'bad code' }, { status: 400 })
  const key = `split:${code}`

  const stored = await kv.get<string | Record<string, unknown>>(key)
  if (!stored) return Response.json({ error: 'not found' }, { status: 404 })
  const split = (typeof stored === 'string' ? JSON.parse(stored) : stored) as {
    paid: Record<string, boolean>
    people: { id: string }[]
  }

  if (req.method === 'GET') return Response.json(split)

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
    if (!split.people.some((p) => p.id === body.personId)) {
      return Response.json({ error: 'unknown person' }, { status: 400 })
    }
    split.paid = { ...split.paid, [body.personId]: body.paid }
    const ttl = await kv.ttl(key)
    await kv.set(key, JSON.stringify(split), { ex: ttl > 0 ? ttl : 24 * 60 * 60 })
    return Response.json(split)
  }

  return new Response('method not allowed', { status: 405 })
}
