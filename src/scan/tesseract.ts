// PLAN.md §4.4 — tier 3. Lazy-load WASM + traineddata only on first fallback;
// the library's default langPath serves the ~2 MB tessdata_fast English set
// (a custom gh/tessdata_fast path 404s — the raw repo has no .gz files).
// Word-level boxes feed the §4.5 parser.
import type { ScanResult } from '../lib/types'
import { parseWords, type Word } from './parser'

const OCR_TIMEOUT_MS = 90_000

/** §1 "never broken" — OCR must reject, never hang; the UI then offers manual entry. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`on-device OCR timed out after ${ms / 1000}s`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

export type OcrProgress = (step: string, progress: number) => void

async function recognize(image: Blob, onProgress?: OcrProgress): Promise<ScanResult> {
  const { createWorker } = await import('tesseract.js') // lazy — not in the main bundle
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => onProgress?.(m.status, m.progress ?? 0),
  })
  try {
    const { data } = await worker.recognize(image, {}, { blocks: true })
    const words: Word[] = []
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          for (const w of line.words ?? []) {
            words.push({
              text: w.text,
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1,
            })
          }
        }
      }
    }
    return parseWords(words)
  } finally {
    await worker.terminate()
  }
}

export async function scanWithTesseract(image: Blob, onProgress?: OcrProgress): Promise<ScanResult> {
  try {
    return await withTimeout(recognize(image, onProgress), OCR_TIMEOUT_MS)
  } catch (e) {
    console.error('[splitty] on-device OCR failed:', e)
    throw e
  }
}
