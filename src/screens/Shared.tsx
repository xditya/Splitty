// PLAN.md §9 — the shared split view: /s/CODE (KV, polled every 15s) or
// /s#d=… (lz-string fragment, fully serverless). Read-only amounts, live
// settlement, per-person UPI QR when the payload carries a VPA.
//
// §10.4 — this screen belongs to the people who OWE. They can say "I've sent
// it" (a claim); only the payer, on their own summary, can say it arrived. And
// because a UPI app takes over the whole screen, the moment they come back is
// the one moment they remember whether it worked — so that is when we ask.
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'react-qr-code'
import { Drawer } from 'vaul'
import { decodeFragment, fetchCodeShare, fragmentVpa, patchSettle, type SharedSplit } from '../share/codec'
import { MoneyStatic } from '../components/Money'
import { Button } from '../components/Button'
import { Check, Clock, QrCode as QrIcon } from '../components/icons'
import { firstName, initials } from '../lib/palette'
import { settlePatch, settleState } from '../lib/settle'
import { iosAppLinks, platform, upiLink } from '../lib/upi'
import { clsx } from 'clsx'

/** Below this, a return is a bounce — a mis-tap, or no UPI app to open. */
const AWAY_MS = 3000

export function SharedScreen() {
  const { code } = useParams<{ code: string }>()
  const [split, setSplit] = useState<SharedSplit | null | 'loading'>('loading')
  const [qrPersonId, setQrPersonId] = useState<string | null>(null)
  // 'pay' shows the QR; 'confirm' is the question we ask on the way back.
  const [phase, setPhase] = useState<'pay' | 'confirm'>('pay')
  const payIntent = useRef<{ personId: string; at: number } | null>(null)
  // see Summary: a poll that started before a tap must not undo it
  const localWriteUntil = useRef(0)

  // A UPI link hands the screen to another app, so the page goes hidden and
  // comes back — the only signal a web page ever gets about a UPI payment. It
  // proves nothing about the money; it just tells us when to ask.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const intent = payIntent.current
      if (!intent || Date.now() - intent.at < AWAY_MS) return
      payIntent.current = null
      setQrPersonId(intent.personId) // survives the OS closing the drawer
      setPhase('confirm')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (code) {
        const s = await fetchCodeShare(code)
        if (Date.now() < localWriteUntil.current) return
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
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="text-sm leading-relaxed">
          Couldn't find that split — it may have expired (links live 30 days).
        </p>
        <Link
          to="/"
          className="pressable mt-4 inline-block rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-paper"
        >
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

  const armPayIntent = (personId: string) => {
    payIntent.current = { personId, at: Date.now() }
  }

  /** Claim or retract "I've sent it". Never sets `paid` — that is the payer's. */
  const setClaim = async (personId: string, claimed: boolean) => {
    const patch = settlePatch(claimed ? 'claimed' : 'pending')
    localWriteUntil.current = Date.now() + 4000
    setSplit({ ...split, claimed: { ...(split.claimed ?? {}), [personId]: claimed } })
    // Fragment shares have no server, so the claim lives only in this tab —
    // the same as the paid toggle has always been on those links.
    if (code) await patchSettle(code, personId, { claimed: patch.claimed })
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
          const state = settleState(p.id, split.payerId, split.paid, split.claimed)
          return (
            <div key={p.id} className="flex items-start gap-3 border-b border-dashed border-rule px-3 py-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: p.color }}
              >
                {initials(p.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {p.name}
                  {isPayer && <span className="ml-1.5 text-[10px] font-normal text-ink-faint">paid the bill</span>}
                </div>
                {!isPayer && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canPay && state === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setPhase('pay')
                          setQrPersonId(p.id)
                        }}
                      >
                        <QrIcon size={14} />
                        Pay
                      </Button>
                    )}
                    {state === 'confirmed' ? (
                      // Only the payer can grant or withdraw this, so here it
                      // is a statement of fact, not a button.
                      <span className="flex min-h-9 items-center gap-1.5 truncate px-1 text-xs font-semibold whitespace-nowrap text-settle-paid">
                        <Check size={14} aria-hidden />
                        {payer ? `${firstName(payer.name)} confirmed` : 'Confirmed'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void setClaim(p.id, state !== 'claimed')}
                        aria-pressed={state === 'claimed'}
                        aria-label={
                          state === 'claimed'
                            ? `Undo — ${p.name} has not sent it`
                            : `${p.name} has sent it`
                        }
                        className={clsx(
                          'pressable flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold whitespace-nowrap',
                          state === 'claimed' ? 'text-amber-700' : 'text-settle-pending',
                        )}
                      >
                        <Clock size={14} aria-hidden />
                        {state === 'claimed'
                          ? `Waiting for ${payer ? firstName(payer.name) : 'confirmation'}`
                          : "I've paid"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <MoneyStatic paise={p.total} className="text-base font-semibold" />
            </div>
          )
        })}
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="text-sm font-semibold uppercase tracking-wide">Total</span>
          <MoneyStatic paise={split.total} className="text-base font-semibold" />
        </div>
      </section>

      {!canPay && (
        <p className="banner-enter mt-3 rounded-lg border border-rule bg-paper-raised px-3 py-2 text-center text-[11px] leading-relaxed text-ink-faint">
          This split was shared without a UPI ID, so there's no Pay button —{' '}
          {payer ? `ask ${payer.name}` : 'ask whoever paid'} where to send the money, then mark
          yourself paid.
        </p>
      )}

      <p className="mt-4 text-center text-[11px] text-ink-faint">
        Made with{' '}
        <Link to="/" className="underline">
          Splitty
        </Link>{' '}
        — nothing about this bill is stored beyond the split itself.
      </p>

      <Drawer.Root
        open={qrPerson !== undefined && qrPersonId !== null}
        onOpenChange={(o) => {
          if (o) return
          setQrPersonId(null)
          setPhase('pay')
          payIntent.current = null
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-30 bg-black/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 rounded-t-xl bg-paper-raised p-6 pb-[max(24px,env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rule" />
            {qrPerson && phase === 'confirm' && (
              <div className="flex flex-col gap-3">
                <Drawer.Title className="font-warm text-xl">Did that go through?</Drawer.Title>
                <p className="text-sm leading-relaxed text-ink-faint">
                  <MoneyStatic paise={qrPerson.total} className="font-semibold text-ink" /> to{' '}
                  {payer?.name ?? 'the payer'}. We can't see your bank, so just tell us — they'll
                  confirm once it lands.
                </p>
                <Button
                  variant="primary"
                  full
                  onClick={() => {
                    void setClaim(qrPerson.id, true)
                    setQrPersonId(null)
                    setPhase('pay')
                  }}
                >
                  <Check size={16} />
                  Yes, I've sent it
                </Button>
                <Button full onClick={() => setPhase('pay')}>
                  Not yet — show the QR again
                </Button>
              </div>
            )}
            {qrPerson && canPay && phase === 'pay' && (
              <div className="flex flex-col items-center gap-3">
                <Drawer.Title className="font-warm text-xl">{qrPerson.name} pays</Drawer.Title>
                <MoneyStatic paise={qrPerson.total} className="text-3xl font-bold" />
                <div className="rounded-xl bg-white p-4">
                  <QRCode value={upiFor(qrPerson.id)} size={220} aria-label="UPI payment QR" />
                </div>
                <button
                  type="button"
                  onClick={() => setPhase('confirm')}
                  className="pressable text-xs font-semibold text-ink-faint underline"
                >
                  Already sent it?
                </button>
                {platform() === 'android' && (
                  <a
                    href={upiFor(qrPerson.id)}
                    onClick={() => armPayIntent(qrPerson.id)}
                    className="pressable w-full rounded-lg bg-ink py-3 text-center text-sm font-semibold text-paper"
                  >
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
                      <a
                        key={l.label}
                        href={l.url}
                        onClick={() => armPayIntent(qrPerson.id)}
                        className="pressable flex-1 rounded-lg border border-rule py-2.5 text-center text-xs font-semibold"
                      >
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
