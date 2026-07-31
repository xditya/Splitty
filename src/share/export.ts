// Export the settled split as a shareable artifact: a receipt-styled PNG for
// messengers (WhatsApp etc. via the native share sheet), or clean text.
// All client-side — nothing leaves the device until the user shares it.
import { allocate, computeSplit } from '../lib/split'
import { formatPaise, sum, type Paise } from '../lib/money'
import { initials } from '../lib/palette'
import { unitsLabel } from '../lib/units'
import type { Bill } from '../lib/types'

interface PersonExport {
  name: string
  color: string
  isPayer: boolean
  paid: boolean
  total: Paise
  rows: { label: string; amount: Paise }[]
}

interface ExportData {
  title: string
  subtitle: string | null
  people: PersonExport[]
  total: Paise
  payerLine: string | null
}

/** "· 1/2 of 3" when an item is shared or partially taken; empty for a solo whole item. */
function unitsSuffix(share: number, qty: number, holders: number): string {
  if (holders <= 1 && share >= qty - 0.01) return ''
  const lbl = unitsLabel(share) || '1'
  return qty > 1 ? ` · ${lbl.replace('×', '')} of ${qty}` : ` · ${lbl.replace('×', '')} share`
}

export function buildExport(bill: Bill): ExportData {
  const split = computeSplit(bill)
  const payer = bill.people.find((p) => p.id === bill.payerId) ?? null

  const people: PersonExport[] = bill.people.map((p) => {
    const b = split.perPerson[p.id]
    const rows: { label: string; amount: Paise }[] = []
    for (const item of bill.items) {
      const share = item.shares[p.id] ?? 0
      if (share <= 0) continue
      const parts = allocate(item.lineTotal, item.shares)
      const holders = Object.values(item.shares).filter((v) => v > 0).length
      rows.push({
        label: `${item.name || 'Item'}${unitsSuffix(share, Math.max(1, item.qty), holders)}`,
        amount: parts[p.id] ?? 0,
      })
    }
    const chargeTotal = sum(Object.values(b?.charges ?? {}))
    if (chargeTotal !== 0) {
      rows.push({ label: chargeTotal > 0 ? 'Taxes & charges' : 'Charges & discounts', amount: chargeTotal })
    }
    return {
      name: p.name,
      color: p.color,
      isPayer: p.id === bill.payerId,
      paid: p.id === bill.payerId || !!bill.paid[p.id],
      total: b?.total ?? 0,
      rows,
    }
  })

  return {
    title: bill.merchant || 'Bill split',
    subtitle: bill.date,
    people,
    total: split.allocatedTotal,
    payerLine: payer
      ? `Paid by ${payer.name}${bill.payerVpa ? ` — pay to ${bill.payerVpa}` : ''}`
      : null,
  }
}

/** Clean plain text for messengers that mangle images or as a copy fallback. */
export function buildSplitText(bill: Bill): string {
  const d = buildExport(bill)
  const lines: string[] = [`🧾 ${d.title}${d.subtitle ? ` · ${d.subtitle}` : ''} — split with Splitty`, '']
  for (const p of d.people) {
    lines.push(`${p.name}${p.isPayer ? ' (paid the bill)' : ''}${p.paid && !p.isPayer ? ' ✓ paid' : ''} — ${formatPaise(p.total)}`)
    for (const r of p.rows) lines.push(`  • ${r.label} — ${formatPaise(r.amount)}`)
    lines.push('')
  }
  lines.push(`Total — ${formatPaise(d.total)}`)
  if (d.payerLine) lines.push(d.payerLine)
  return lines.join('\n')
}

/** Receipt-styled PNG, drawn on canvas. Thermal-paper vernacular (§15.1). */
export async function renderSplitImage(bill: Bill): Promise<Blob> {
  const d = buildExport(bill)
  const W = 720
  const PAD = 40
  const SCALE = 2
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  const WARM = 'Georgia, serif'

  // measure height
  let h = PAD + 56 + 30 // title + subtitle
  for (const p of d.people) h += 24 + 40 + p.rows.length * 30 + 8
  h += 24 + 46 + (d.payerLine ? 28 : 0) + 44 + PAD // rule + total + payer + footer

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = h * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  // paper
  ctx.fillStyle = '#f6f3ee'
  ctx.fillRect(0, 0, W, h)
  ctx.fillStyle = '#fffdf8'
  ctx.fillRect(16, 16, W - 32, h - 32)

  const right = W - PAD
  let y = PAD + 24

  const ellipsize = (text: string, maxW: number): string => {
    if (ctx.measureText(text).width <= maxW) return text
    let t = text
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
    return `${t}…`
  }
  const dashRule = (yy: number) => {
    ctx.strokeStyle = '#e3ddd2'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(PAD, yy)
    ctx.lineTo(right, yy)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // header
  ctx.fillStyle = '#2b2622'
  ctx.font = `bold 30px ${WARM}`
  ctx.fillText(ellipsize(d.title, right - PAD), PAD, y)
  y += 30
  ctx.font = `13px ${MONO}`
  ctx.fillStyle = '#8a8177'
  ctx.fillText(`${d.subtitle ? `${d.subtitle} · ` : ''}split with Splitty`, PAD, y)
  y += 26

  for (const p of d.people) {
    dashRule(y)
    y += 30

    // avatar dot + initials
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(PAD + 13, y - 6, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold 11px ${MONO}`
    ctx.textAlign = 'center'
    ctx.fillText(initials(p.name), PAD + 13, y - 2)
    ctx.textAlign = 'left'

    ctx.fillStyle = '#2b2622'
    ctx.font = `bold 17px ${MONO}`
    const tag = p.isPayer ? '  · paid the bill' : p.paid ? '  · ✓ paid' : ''
    const totalText = formatPaise(p.total)
    const totalW = ctx.measureText(totalText).width
    ctx.fillText(ellipsize(`${p.name}${tag}`, right - PAD - 34 - totalW - 16), PAD + 34, y)
    ctx.textAlign = 'right'
    ctx.fillText(totalText, right, y)
    ctx.textAlign = 'left'
    y += 10

    ctx.font = `14px ${MONO}`
    for (const r of p.rows) {
      y += 28
      ctx.fillStyle = '#8a8177'
      const amt = formatPaise(r.amount)
      const amtW = ctx.measureText(amt).width
      ctx.fillText(ellipsize(`· ${r.label}`, right - PAD - 34 - amtW - 16), PAD + 34, y)
      ctx.textAlign = 'right'
      ctx.fillText(amt, right, y)
      ctx.textAlign = 'left'
    }
    y += 12
  }

  // total
  ctx.strokeStyle = '#2b2622'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 34
  ctx.fillStyle = '#2b2622'
  ctx.font = `bold 20px ${MONO}`
  ctx.fillText('TOTAL', PAD, y)
  ctx.textAlign = 'right'
  ctx.fillText(formatPaise(d.total), right, y)
  ctx.textAlign = 'left'

  if (d.payerLine) {
    y += 28
    ctx.font = `13px ${MONO}`
    ctx.fillStyle = '#8a8177'
    ctx.fillText(ellipsize(d.payerLine, right - PAD), PAD, y)
  }

  y += 34
  ctx.font = `12px ${MONO}`
  ctx.fillStyle = '#8a8177'
  ctx.fillText('made with Splitty — scan, split, settle', PAD, y)

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image encode failed'))), 'image/png'),
  )
}
