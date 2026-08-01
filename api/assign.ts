// Shared-key proxy for chat-to-assignment. Text-only (no images), tiny
// payloads, rate limited like /api/scan. Nothing is stored or logged.
import { kv } from '@vercel/kv'
import { parseGeminiResponse } from '../src/scan/contract'
import { assignRequestBody, type AssignItem, type AssignPerson } from '../src/scan/assignContract'

export const config = { runtime: 'edge' }

const LIMIT = 6
const WINDOW = 60

function getIp(req: Request) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  if (process.env.DISABLE_RATE_LIMIT !== 'true') {
    const bucket = `rla:${getIp(req)}:${Math.floor(Date.now() / (WINDOW * 1000))}`
    const n = await kv.incr(bucket)
    if (n === 1) await kv.expire(bucket, WINDOW * 2)
    if (n > LIMIT) {
      const retryAfter = WINDOW - Math.floor((Date.now() / 1000) % WINDOW)
      return Response.json(
        { error: 'flood', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      )
    }
  }

  let body: { message?: string; people?: AssignPerson[]; items?: AssignItem[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 })
  }
  const { message, people, items } = body
  if (
    !message ||
    message.length > 600 ||
    !Array.isArray(people) ||
    people.length === 0 ||
    people.length > 30 ||
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 60
  ) {
    return Response.json({ error: 'bad request' }, { status: 400 })
  }

  const key = process.env.SHARED_GEMINI_KEY
  if (!key) return Response.json({ error: 'quota' }, { status: 429 })
  const model = process.env.SHARED_GEMINI_MODEL ?? 'gemini-3.6-flash'

  let upstream: Response
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(assignRequestBody(message, people, items, model)),
        signal: AbortSignal.timeout(30_000),
      },
    )
  } catch {
    return Response.json({ error: 'upstream timeout' }, { status: 502 })
  }
  if (upstream.status === 429 || upstream.status === 403) {
    return Response.json({ error: 'quota' }, { status: 429 })
  }
  if (!upstream.ok) return Response.json({ error: 'upstream' }, { status: 502 })

  try {
    return Response.json(parseGeminiResponse(await upstream.json()))
  } catch {
    return Response.json({ error: 'parse' }, { status: 502 })
  }
}
