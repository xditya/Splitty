// PLAN.md §4.5 — Tesseract gives words + boxes; recover the receipt's structure
// geometrically. Pure functions so this is unit-testable without WASM.
import type { ScanResult } from '../lib/types'
import { parseMoney } from '../lib/money'

export interface Word {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

const ANCHOR = /^(sub\s?total|total|grand\s?total|cgst|sgst|gst|vat|service|tip|discount|round(ing|\s?off)?)/i
const NUMERIC = /^[₹]?-?\d[\d,]*(\.\d{1,2})?$/

function kindOf(label: string): ScanResult['charges'][number]['kind'] {
  const l = label.toLowerCase()
  if (/cgst|sgst|gst/.test(l)) return 'gst'
  if (/vat/.test(l)) return 'vat'
  if (/service/.test(l)) return 'service'
  if (/tip/.test(l)) return 'tip'
  if (/discount/.test(l)) return 'discount'
  if (/round/.test(l)) return 'rounding'
  return 'other'
}

/** §4.5.1 — cluster words into lines by y-centre, tolerance 0.6 × median height. */
export function groupLines(words: Word[]): Word[][] {
  if (words.length === 0) return []
  const heights = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b)
  const tol = 0.6 * heights[Math.floor(heights.length / 2)]
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)
  const lines: Word[][] = []
  for (const w of sorted) {
    const yc = (w.y0 + w.y1) / 2
    const last = lines[lines.length - 1]
    if (last) {
      const lastYc = last.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / last.length
      if (Math.abs(yc - lastYc) <= tol) {
        last.push(w)
        continue
      }
    }
    lines.push([w])
  }
  for (const line of lines) line.sort((a, b) => a.x0 - b.x0)
  return lines
}

/** §4.5.2 — the dominant right-edge cluster of numeric words = the price column. */
export function priceColumnRange(lines: Word[][]): [number, number] | null {
  const edges: number[] = []
  for (const line of lines) {
    const nums = line.filter((w) => NUMERIC.test(w.text))
    if (nums.length > 0) edges.push(nums[nums.length - 1].x1)
  }
  if (edges.length < 3) return null
  edges.sort((a, b) => a - b)
  // widest window of edges within 3% of max edge
  const span = Math.max(...edges) * 0.03
  let best: [number, number] | null = null
  let bestCount = 0
  for (let i = 0; i < edges.length; i++) {
    let j = i
    while (j < edges.length && edges[j] - edges[i] <= span) j++
    if (j - i > bestCount) {
      bestCount = j - i
      best = [edges[i] - span, edges[j - 1] + span]
    }
  }
  return best
}

/** §4.5.3–5 — full geometric parse. */
export function parseWords(words: Word[]): ScanResult {
  const lines = groupLines(words.filter((w) => w.text.trim().length > 0))
  const priceCol = priceColumnRange(lines)

  const items: ScanResult['items'] = []
  const charges: ScanResult['charges'] = []
  let total: number | null = null
  let subtotal: number | null = null
  let seenAnchor = false

  for (const line of lines) {
    const text = line.map((w) => w.text).join(' ')
    const numeric = line.filter((w) => NUMERIC.test(w.text))
    const lastNum = numeric[numeric.length - 1]
    const amount = lastNum ? parseMoney(lastNum.text) : null

    if (ANCHOR.test(text.trim())) {
      seenAnchor = true // §4.5.4 — anchors terminate the item list
      if (amount == null) continue
      const label = line
        .filter((w) => w !== lastNum)
        .map((w) => w.text)
        .join(' ')
      if (/^sub\s?total/i.test(text.trim())) subtotal = amount
      else if (/^(grand\s?)?total/i.test(text.trim())) total = amount
      else {
        const kind = kindOf(label)
        charges.push({
          label,
          amount: kind === 'discount' && amount > 0 ? -amount : amount,
          kind,
          appliesTo: kind === 'vat' ? 'alcohol' : 'all',
        })
      }
      continue
    }

    if (seenAnchor || amount == null || amount === 0) continue

    // §4.5.3 — leading small integer = qty, middle = name, rightmost numeric = total
    const rest = line.filter((w) => w !== lastNum)
    let qty = 1
    if (rest.length > 1 && /^\d{1,2}$/.test(rest[0].text) && parseInt(rest[0].text, 10) < 100) {
      qty = Math.max(1, parseInt(rest[0].text, 10))
      rest.shift()
    }
    const name = rest.map((w) => w.text).join(' ').trim()
    if (!name) continue

    // §4.5.5 — self-validation against the price column x-range
    const inColumn = priceCol == null || (lastNum.x1 >= priceCol[0] && lastNum.x1 <= priceCol[1])
    items.push({
      name,
      qty,
      lineTotal: amount,
      category: /beer|wine|whisk|vodka|rum|gin|cocktail|breezer|lager/i.test(name) ? 'alcohol' : 'food',
      confidence: inColumn ? 'high' : 'low',
    })
  }

  return { merchant: null, date: null, items, charges, subtotal, total, engine: 'tesseract' }
}
