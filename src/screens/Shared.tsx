// PLAN.md §9 — the shared split view: /s/CODE (KV, polled every 15s) or
// /s#d=… (lz-string fragment, fully serverless). Read-only amounts, live
// paid/pending, per-person UPI QR when the payload carries a VPA.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'react-qr-code'
import { Drawer } from 'vaul'
import { decodeFragment, fetchCodeShare, fragmentVpa, patchPaid, type SharedSplit } from '../share/codec'
import { MoneyStatic } from '../components/Money'
import { initials } from '../lib/palette'
import { iosAppLinks, platform, upiLink } from '../lib/upi'
import { clsx } from 'clsx'

export function SharedScreen() {
  const { code } = useParams<{ code: string }>()
  const [split, setSplit] = useState<SharedSplit | null | 'loading'>('loading')
  const [qrPersonId, setQrPersonId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (code) {
        const s = await fetchCodeShare(code)
        // §10.5 — the VPA rides in the URL fragment (never stored in KV);
        // merge it back so recipients of code links get the Pay button
        if (!cancelled) setSplit(s ? { ...s, payerVpa: s.payerVpa ?? fragmentVpa() } : s)
      } else {
        const m = location.hash.match(/[#&]d=([^&]+)/)
        setSplit(m ? decodeFragment(m[1]) : null)
      }
    }
    void load()
    // §9 — live settlement: poll while the view is open
    const t = code ? setInterval(load, 15000) : undefined
    return () => {
      cancelled = true
      if (t) clearInterval(t)
    }
  }, [code])

  if (split === 'loading') {
    return <p className="p-10 text-center text-sm text-ink-faint">Loading the split…</p>
  }
  if (!split) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm">Couldn't find that split — it may have expired (links live 30 days).</p>
        <Link to="/" className="pressable mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-bold text-paper">
          Start a new one
        </Link>
      </div>
    )
  }

  const payer = split.people.find((p) => p.id === split.payerId)
  const qrPerson = split.people.find((p) => p.id === qrPersonId)
  const canPay = !!split.payerVpa
  const upiFor = (personId: string) => {
    const p = split.people.find((x) => x.id === personId)!
    return upiLink({
      vpa: split.payerVpa!,
      payeeName: payer?.name ?? 'Splitty',
      paise: p.total,
      note: `${split.merchant ?? 'Bill'} split`,
      ref: `SPLT${split.code ?? 'X'}${split.people.indexOf(p)}`,
    })
  }

  const togglePaid = async (personId: string) => {
    const next = !split.paid[personId]
    setSplit({ ...split, paid: { ...split.paid, [personId]: next } })
    if (code) await patchPaid(code, personId, next) // §10.4 — manual toggle only
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="font-warm text-2xl">{split.merchant ?? 'Our bill'}</h1>
      <p className="mt-1 text-xs text-ink-faint">
        {payer ? `${payer.name} paid — settle up below.` : 'Settle up below.'}
      </p>

      <section className="torn-edge mt-4 bg-paper-raised pb-3 shadow-sm">
        {split.people.map((p) => {
          const isPayer = p.id === split.payerId
          const paid = isPayer || !!split.paid[p.id]
          return (
            <div key={p.id} className="flex items-center gap-3 border-b border-dashed border-rule px-3 py-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: p.color }}
              >
                {initials(p.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">
                  {p.name}
                  {isPayer && <span className="ml-1 text-[10px] font-normal text-ink-faint">paid the bill</span>}
                </div>
              </div>
              <MoneyStatic paise={p.total} className="text-base font-bold" />
              {!isPayer && (
                <div className="flex flex-col items-end gap-1">
                  {canPay && (
                    <button
                      type="button"
                      onClick={() => setQrPersonId(p.id)}
                      className="pressable rounded-md border border-rule px-2.5 py-1.5 text-[11px] font-bold"
                    >
                      Pay
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => togglePaid(p.id)}
                    aria-pressed={paid}
                    className={clsx(
                      'pressable rounded-md px-2.5 py-1.5 text-[11px] font-bold',
                      paid ? 'text-settle-paid' : 'text-settle-pending',
                    )}
                  >
                    {paid ? '✓ Paid' : 'Mark paid'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="text-sm font-bold uppercase tracking-wide">Total</span>
          <MoneyStatic paise={split.total} className="text-base font-bold" />
        </div>
      </section>

      {!canPay && (
        <p className="banner-enter mt-3 rounded-md border border-rule bg-paper-raised px-3 py-2 text-center text-[11px] text-ink-faint">
          This split was shared without a UPI ID, so there's no Pay button —{' '}
          {payer ? `ask ${payer.name}` : 'ask whoever paid'} where to send the money, then mark
          yourself paid.
        </p>
      )}

      <p className="mt-4 text-center text-[11px] text-ink-faint">
        Made with <Link to="/" className="underline">Splitty</Link> — nothing about this bill is stored
        beyond the split itself.
      </p>

      <Drawer.Root open={qrPerson !== undefined && qrPersonId !== null} onOpenChange={(o) => !o && setQrPersonId(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-30 bg-black/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 rounded-t-xl bg-paper-raised p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rule" />
            {qrPerson && canPay && (
              <div className="flex flex-col items-center gap-3">
                <Drawer.Title className="font-warm text-xl">{qrPerson.name} pays</Drawer.Title>
                <MoneyStatic paise={qrPerson.total} className="text-3xl font-bold" />
                <div className="rounded-lg bg-white p-4">
                  <QRCode value={upiFor(qrPerson.id)} size={220} aria-label="UPI payment QR" />
                </div>
                {platform() === 'android' && (
                  <a href={upiFor(qrPerson.id)} className="pressable w-full rounded-md bg-ink py-3 text-center text-sm font-bold text-paper">
                    Open UPI app
                  </a>
                )}
                {platform() === 'ios' && (
                  <div className="flex w-full gap-2">
                    {iosAppLinks({
                      vpa: split.payerVpa!,
                      payeeName: payer?.name ?? 'Splitty',
                      paise: qrPerson.total,
                      note: `${split.merchant ?? 'Bill'} split`,
                      ref: `SPLT${split.code ?? 'X'}${split.people.indexOf(qrPerson)}`,
                    }).map((l) => (
                      <a key={l.label} href={l.url} className="pressable flex-1 rounded-md border border-rule py-2.5 text-center text-xs font-bold">
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}
