// PLAN.md §4.3 tier 1 (user key, direct from browser — image never touches our
// infra) and the shared-tier client for tier 2. §11 — validate keys, clear on 401.
import { geminiRequestBody, parseGeminiResponse, type RawExtraction } from './contract'
import { clearUserKey } from '../store/settings'
import type { EngineTag, ScanResult } from '../lib/types'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export class ScanError extends Error {
  constructor(
    public reason: 'flood' | 'quota' | 'auth' | 'network' | 'parse' | 'cancelled',
    public retryAfter?: number,
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason)
  }
}

/** Pull Google's human-readable error message out of an error response. */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body.error?.message?.slice(0, 200) ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export function rawToScanResult(raw: RawExtraction, engine: EngineTag): ScanResult {
  return {
    merchant: raw.merchant ?? null,
    date: raw.date ?? null,
    items: (raw.items ?? [])
      .filter((i) => Number.isFinite(i.line_total))
      .map((i) => ({
        name: i.name ?? '',
        qty: Math.max(1, Math.round(i.qty ?? 1)),
        lineTotal: Math.round(i.line_total),
        category: i.category ?? 'food',
        confidence: i.confidence ?? 'low',
      })),
    charges: (raw.charges ?? [])
      .filter((c) => Number.isFinite(c.amount))
      .map((c) => ({
        label: c.label ?? '',
        amount: Math.round(c.amount),
        kind: (['gst', 'vat', 'service', 'tip', 'packaging', 'delivery', 'discount', 'rounding'].includes(c.kind)
          ? c.kind
          : 'other') as ScanResult['charges'][number]['kind'],
        appliesTo: c.applies_to ?? 'all',
      })),
    subtotal: raw.subtotal ?? null,
    total: raw.total ?? null,
    engine,
  }
}

// A scan that hasn't answered in this long is effectively dead — fail loudly
// (toast + on-device fallback) instead of spinning forever.
const GEMINI_TIMEOUT_MS = 40_000

/** Tier 1 — browser → Google directly. */
export async function scanWithUserKey(base64: string, key: string, model: string): Promise<ScanResult> {
  let res: Response
  try {
    res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(geminiRequestBody(base64, model)),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    })
  } catch (e) {
    throw new ScanError(
      'network',
      undefined,
      (e as Error).name === 'TimeoutError' ? `no answer after ${GEMINI_TIMEOUT_MS / 1000}s` : undefined,
    )
  }
  if (res.status === 401 || res.status === 403) {
    if (res.status === 401) clearUserKey() // §11 — auto-clear on 401
    throw new ScanError('auth', undefined, await errorDetail(res))
  }
  if (res.status === 429) throw new ScanError('quota', undefined, await errorDetail(res))
  if (!res.ok) throw new ScanError('network', undefined, await errorDetail(res))
  const json = await res.json()
  try {
    return rawToScanResult(parseGeminiResponse(json), 'gemini-user')
  } catch (e) {
    console.error('[splitty] Gemini response unparseable:', e, json)
    throw new ScanError('parse', undefined, e instanceof Error ? e.message : 'bad JSON')
  }
}

/** Tier 2 — our proxy with the shared key (§4.3 flood-vs-quota distinction). */
export async function scanWithSharedKey(base64: string, width: number, height: number): Promise<ScanResult> {
  let res: Response
  try {
    res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: base64, width, height }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    })
  } catch {
    throw new ScanError('network')
  }
  if (res.status === 429) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; retryAfter?: number }
    if (body.error === 'flood') throw new ScanError('flood', body.retryAfter ?? 20)
    throw new ScanError('quota')
  }
  if (res.status === 403) throw new ScanError('quota')
  if (!res.ok) throw new ScanError('network')
  try {
    return rawToScanResult((await res.json()) as RawExtraction, 'gemini-shared')
  } catch {
    throw new ScanError('parse')
  }
}

/**
 * §11 — validate on paste. Uses ListModels: costs zero tokens, proves the key,
 * and returns the models this key can actually use — so a retired model id
 * (like the 2.5 family for new users) can never brick scanning.
 */
export async function validateKey(key: string): Promise<{ ok: boolean; models: string[] }> {
  try {
    const res = await fetch(`${GEMINI_BASE}?pageSize=200&key=${encodeURIComponent(key)}`)
    if (!res.ok) return { ok: false, models: [] }
    const json = (await res.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[]
    }
    const models = (json.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((id) => /flash/.test(id) && !/image|tts|audio|live|exp|preview/.test(id))
      .sort((a, b) => b.localeCompare(a)) // newest family first
    return { ok: true, models }
  } catch {
    return { ok: false, models: [] }
  }
}
