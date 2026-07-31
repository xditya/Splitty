// PLAN.md §3/§12/§13 — the shared-key scan proxy. The image is forwarded to
// Gemini and NEVER persisted or logged. The key lives on a billing-disabled
// project, so worst case is quota exhaustion → the app's designed tesseract
// fallback.
import { kv } from '@vercel/kv'
import { geminiRequestBody, parseGeminiResponse } from '../src/scan/contract'

export const config = { runtime: 'edge' }

const LIMIT = 3
const WINDOW = 60

function getIp(req: Request) {
  // safe to trust on Vercel specifically — the platform sets it (§12)
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  if (process.env.DISABLE_RATE_LIMIT !== 'true') {
    const bucket = `rl:${getIp(req)}:${Math.floor(Date.now() / (WINDOW * 1000))}`
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

  let body: { image?: string; width?: number; height?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 })
  }
  const { image, width = 0, height = 0 } = body
  // §12 — cheap rejects before spending quota: size 5 KB–4 MB, receipts are tall
  if (!image || image.length < 5_000 * 1.33 || image.length > 4_000_000 * 1.37) {
    return Response.json({ error: 'bad image' }, { status: 400 })
  }
  if (width > 0 && height > 0 && width / height > 2) {
    return Response.json({ error: 'bad aspect' }, { status: 400 })
  }

  const key = process.env.SHARED_GEMINI_KEY
  if (!key) return Response.json({ error: 'quota' }, { status: 429 })

  const model = process.env.SHARED_GEMINI_MODEL ?? 'gemini-3.5-flash-lite'
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(geminiRequestBody(image)),
    },
  )

  if (upstream.status === 429 || upstream.status === 403) {
    // Gemini quota gone for the day — distinct from our own flood limiter (§4.3)
    return Response.json({ error: 'quota' }, { status: 429 })
  }
  if (!upstream.ok) return Response.json({ error: 'upstream' }, { status: 502 })

  try {
    const extraction = parseGeminiResponse(await upstream.json())
    return Response.json(extraction)
  } catch {
    return Response.json({ error: 'parse' }, { status: 502 })
  }
}
