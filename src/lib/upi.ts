// PLAN.md §10 — UPI intent links. Built entirely client-side; the VPA never
// reaches the server (§10.5).
import { upiAmount, type Paise } from './money'

export interface UpiParams {
  vpa: string
  payeeName: string
  paise: Paise
  note: string // short, alphanumeric — apps strip special characters (§10.1)
  ref: string // SPLT + share code + person index (§10.1)
}

function query({ vpa, payeeName, paise, note, ref }: UpiParams): string {
  const q = new URLSearchParams({
    pa: vpa,
    pn: payeeName || 'Splitty',
    am: upiAmount(paise),
    cu: 'INR',
    tn: note.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 40) || 'Bill split',
    tr: ref,
  })
  return q.toString()
}

/** Generic link, no packageName — triggers the OS app picker on Android (§10.1). */
export function upiLink(p: UpiParams): string {
  return `upi://pay?${query(p)}`
}

/** §10.2 — iOS has no universal UPI tray; per-app schemes with the same query. */
export function iosAppLinks(p: UpiParams): { label: string; url: string }[] {
  const q = query(p)
  return [
    { label: 'Google Pay', url: `gpay://upi/pay?${q}` },
    { label: 'PhonePe', url: `phonepe://pay?${q}` },
    { label: 'Paytm', url: `paytmmp://pay?${q}` },
  ]
}

export function platform(): 'android' | 'ios' | 'other' {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  return 'other'
}
