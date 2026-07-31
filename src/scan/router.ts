// PLAN.md §4.3 — the engine router. Fallback is automatic and silent; the flood
// case retries ONCE with a live countdown before falling to Tesseract.
import { toast } from 'sonner'
import { getUserKey, useSettings } from '../store/settings'
import { preprocess } from './preprocess'
import { ScanError, scanWithSharedKey, scanWithUserKey } from './gemini'
import { scanWithTesseract } from './tesseract'
import type { ScanResult } from '../lib/types'

export type ScanStatus =
  | { phase: 'preprocess' }
  | {
      phase: 'scanning'
      engine: 'gemini-user' | 'gemini-shared' | 'tesseract'
      /** 0–1, only for tesseract (model download / recognition) */
      progress?: number
      step?: string
    }
  | { phase: 'flood-wait'; secondsLeft: number }

export async function scanBill(
  file: File | Blob,
  onStatus: (s: ScanStatus) => void,
): Promise<ScanResult> {
  onStatus({ phase: 'preprocess' })
  const pre = await preprocess(file)

  const { alwaysOnDevice, model } = useSettings.getState()
  const userKey = getUserKey()

  // §4.2 — content-keyed cache: a re-scan of the same photo is free. But a
  // cached ON-DEVICE result must not satisfy a scan when the user has since
  // set up a Gemini key — rescan and upgrade (the better result then caches).
  const cacheKey = `scan:${pre.hash}`
  const cached = localStorage.getItem(cacheKey)
  if (cached) {
    try {
      const r = JSON.parse(cached) as ScanResult
      const upgradeAvailable = r.engine === 'tesseract' && !alwaysOnDevice && !!userKey
      if (!upgradeAvailable) return r
    } catch {
      localStorage.removeItem(cacheKey)
    }
  }

  const done = (r: ScanResult): ScanResult => {
    // an empty extraction is worthless — never cache it, so retrying the same
    // photo (better light, different engine) gets a real second chance
    if (r.items.length > 0) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(r))
      } catch {
        /* storage full — cache is best-effort */
      }
    }
    return r
  }

  // §14 — the explicit on-device toggle that makes the privacy copy true
  if (alwaysOnDevice) {
    onStatus({ phase: 'scanning', engine: 'tesseract' })
    return done(
      await scanWithTesseract(pre.blob, (step, progress) =>
        onStatus({ phase: 'scanning', engine: 'tesseract', step, progress }),
      ),
    )
  }

  if (userKey) {
    try {
      onStatus({ phase: 'scanning', engine: 'gemini-user' })
      return done(await scanWithUserKey(pre.base64, userKey, model))
    } catch (e) {
      // any tier-1 failure → tier 3 (tier 2 would spend shared quota on a BYOK
      // user). NOT silent anymore: name the reason so a broken key/model/quota
      // can't masquerade as "the app just prefers on-device".
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[splitty] Gemini (your key) failed, falling back to on-device:', e)
      toast.error(`Gemini scan failed — ${msg}. Scanning on-device instead.`, { duration: 10000 })
      onStatus({ phase: 'scanning', engine: 'tesseract' })
      return done(
        await scanWithTesseract(pre.blob, (step, progress) =>
          onStatus({ phase: 'scanning', engine: 'tesseract', step, progress }),
        ),
      )
    }
  }

  // tier 2, with the §4.3 flood-vs-quota distinction
  const trySharedOnce = () => scanWithSharedKey(pre.base64, pre.width, pre.height)
  try {
    onStatus({ phase: 'scanning', engine: 'gemini-shared' })
    return done(await trySharedOnce())
  } catch (e) {
    if (e instanceof ScanError && e.reason === 'flood') {
      // our own limiter: countdown, retry once, then fall to tier 3
      let left = e.retryAfter ?? 20
      while (left > 0) {
        onStatus({ phase: 'flood-wait', secondsLeft: left })
        await new Promise((r) => setTimeout(r, 1000))
        left--
      }
      try {
        onStatus({ phase: 'scanning', engine: 'gemini-shared' })
        return done(await trySharedOnce())
      } catch {
        /* fall through to tesseract */
      }
    }
    onStatus({ phase: 'scanning', engine: 'tesseract' })
    return done(
      await scanWithTesseract(pre.blob, (step, progress) =>
        onStatus({ phase: 'scanning', engine: 'tesseract', step, progress }),
      ),
    )
  }
}
