// PLAN.md §9/§10 — settle up. Per-person UPI QR is the primary payment flow
// (§10.3), fragment share link first with KV code layered on (§9), manual
// mark-as-paid only — never imply verification (§10.4).
// Desktop (lg+): settle list left, payer + share/export right.
import { useEffect, useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import { Drawer } from 'vaul'
import { toast } from 'sonner'
import { useBill } from '../store/bill'
import { useSettings } from '../store/settings'
import { computeSplit } from '../lib/split'
import { Money, MoneyStatic } from '../components/Money'
import { PersonChip } from '../components/Chip'
import { Button } from '../components/Button'
import { AppBar, TwoPane } from '../components/Shell'
import { Check, Clock, Copy, ImageDown, QrCode as QrIcon, Share2 } from '../components/icons'
import { iosAppLinks, platform, upiLink } from '../lib/upi'
import { canInstall, isStandalone, requestInstall } from '../lib/pwa'
import { codeShareUrl, createCodeShare, fragmentUrl, toShared } from '../share/codec'
import { buildSplitText, renderSplitImage } from '../share/export'
import type { Person } from '../lib/types'
import { clsx } from 'clsx'

export function SummaryScreen() {
  const { bill, setStep, setPayer, setPayerVpa, markPaid, shareCode, setShareCode } = useBill()
  const settings = useSettings()
  const [qrPerson, setQrPerson] = useState<Person | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const split = useMemo(() => computeSplit(bill), [bill])

  const payer = bill.people.find((p) => p.id === bill.payerId) ?? null
  const vpa = bill.payerVpa ?? ''
  const nonPayers = bill.people.filter((p) => p.id !== bill.payerId)
  const allSettled = nonPayers.length > 0 && nonPayers.every((p) => bill.paid[p.id])

  // remember VPA on-device only (§10.1) — prefill from settings
  useEffect(() => {
    if (!bill.payerVpa && settings.payerVpa) setPayerVpa(settings.payerVpa)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reaching the summary = the user has genuinely tried the app. Offer the
  // install ONCE, ever, and only where an install path actually exists.
  useEffect(() => {
    if (settings.installPromptSeen || isStandalone() || !canInstall()) return
    settings.markInstallPromptSeen()
    const t = setTimeout(() => {
      toast('Splitty works as an app too', {
        description: 'Add it to your home screen — one tap from dinner to split.',
        action: { label: 'Install', onClick: () => void requestInstall() },
        duration: 12000,
      })
    }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reactive, never a stale snapshot: a VPA typed AFTER sharing still lands in
  // the displayed QR/link, so the recipient's Pay button can't silently vanish.
  const shareUrl = useMemo(() => {
    if (!shareOpen) return null
    if (shareCode) return codeShareUrl(shareCode, vpa || null)
    return fragmentUrl(toShared(bill))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareOpen, shareCode, bill, vpa])

  const buildShare = async () => {
    // §9 — try the KV code path; fragment fallback keeps sharing serverless
    const code = shareCode ?? (await createCodeShare(toShared(bill)))
    if (code) setShareCode(code)
    setShareOpen(true)
    return code ? codeShareUrl(code, vpa || null) : fragmentUrl(toShared(bill))
  }

  const doShare = async () => {
    const url = await buildShare()
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Splitty — our split', url })
        return
      } catch {
        /* user cancelled — fall through to clipboard */
      }
    }
    await navigator.clipboard.writeText(url)
    toast('Link copied')
  }

  // Export the breakdown — image via the native share sheet (WhatsApp etc.),
  // download fallback on desktop; text via share sheet or clipboard.
  const exportImage = async () => {
    try {
      const blob = await renderSplitImage(bill)
      const file = new File([blob], 'splitty-split.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Our bill split' })
          return
        } catch (e) {
          if ((e as Error).name === 'AbortError') return // user closed the sheet
        }
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'splitty-split.png'
      a.click()
      URL.revokeObjectURL(url)
      toast('Image downloaded')
    } catch (e) {
      console.error('[splitty] image export failed:', e)
      toast.error('Could not create the image — try “Copy as text”.')
    }
  }

  const exportText = async () => {
    const text = buildSplitText(bill)
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    await navigator.clipboard.writeText(text)
    toast('Copied — paste it into any chat')
  }

  const upiFor = (p: Person, index: number) =>
    upiLink({
      vpa,
      payeeName: payer?.name ?? settings.payerName ?? 'Splitty',
      paise: split.perPerson[p.id]?.total ?? 0,
      note: `${bill.merchant ?? 'Bill'} split`,
      ref: `SPLT${shareCode ?? bill.id}${index}`,
    })

  const payerCard = (
    <section className="rounded-lg border border-rule bg-paper-raised p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        Who paid the bill?
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {bill.people.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={bill.payerId === p.id}
            onClick={() => setPayer(p.id)}
            className={clsx(
              'pressable flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm',
              bill.payerId === p.id ? 'border-ink bg-ink text-paper' : 'border-rule hover:bg-paper',
            )}
          >
            <PersonChip person={p} size="sm" />
            {p.name}
          </button>
        ))}
      </div>
      <input
        value={vpa}
        onChange={(e) => {
          setPayerVpa(e.target.value)
          settings.setPayerVpa(e.target.value)
        }}
        placeholder="Payer's UPI ID (e.g. name@okbank)"
        className="mt-3 min-h-11 w-full rounded-lg border border-rule bg-paper px-3 font-mono text-sm"
      />
      <p className="mt-1.5 text-[11px] text-ink-faint">Stays on this device. Never sent to our servers.</p>
    </section>
  )

  const settleList = (
    <section className="torn-edge bg-paper-raised pb-3 shadow-sm">
      {bill.people.map((p) => {
        const b = split.perPerson[p.id]
        const isPayer = p.id === bill.payerId
        const paid = isPayer || !!bill.paid[p.id]
        return (
          <div key={p.id} className="flex items-start gap-3 border-b border-dashed border-rule px-3 py-3">
            <PersonChip person={p} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {p.name}
                {isPayer && <span className="ml-1.5 text-[10px] font-normal text-ink-faint">paid the bill</span>}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-faint">
                items <MoneyStatic paise={b?.itemsSubtotal ?? 0} /> · charges{' '}
                <MoneyStatic paise={(b?.total ?? 0) - (b?.itemsSubtotal ?? 0)} />
              </div>
              {!isPayer && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={!vpa} onClick={() => setQrPerson(p)}>
                    <QrIcon size={14} />
                    Pay
                  </Button>
                  <button
                    type="button"
                    onClick={() => markPaid(p.id, !bill.paid[p.id])}
                    aria-pressed={paid}
                    className={clsx(
                      'pressable flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold',
                      paid ? 'text-settle-paid' : 'text-settle-pending',
                    )}
                  >
                    {paid ? <Check size={14} /> : <Clock size={14} />}
                    {paid ? 'Paid' : 'Pending'}
                  </button>
                </div>
              )}
            </div>
            <Money paise={b?.total ?? 0} className="text-base font-semibold" />
          </div>
        )
      })}
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="text-sm font-semibold uppercase tracking-wide">Total</span>
        <MoneyStatic paise={split.allocatedTotal} className="text-base font-semibold" />
      </div>
    </section>
  )

  const shareCard = (
    <section className="space-y-2">
      {!vpa && (
        <p className="banner-enter rounded-lg border border-amber-flag/40 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-flag">
          Add the payer's UPI ID above so everyone gets a Pay button in the shared link.
        </p>
      )}
      <Button variant="primary" full onClick={doShare}>
        <Share2 size={18} />
        Share this split
      </Button>
      {shareUrl && (
        <div className="banner-enter flex flex-col items-center gap-2 rounded-lg border border-rule bg-white p-4">
          <QRCode value={shareUrl} size={168} aria-label="Share link QR" />
          {/* §9 — surface the join code itself, not just the URL it hides in */}
          {shareCode && (
            <div className="mt-1 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                or type this in “Join a split”
              </div>
              <div className="font-mono text-2xl font-bold tracking-[0.35em]">{shareCode}</div>
            </div>
          )}
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(shareUrl)
              toast('Link copied')
            }}
            className="pressable max-w-full truncate font-mono text-[11px] text-ink-faint underline"
          >
            {shareUrl.length > 52 ? `${shareUrl.slice(0, 52)}…` : shareUrl}
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={exportImage}>
          <ImageDown size={16} />
          Share as image
        </Button>
        <Button className="flex-1" onClick={exportText}>
          <Copy size={16} />
          Copy as text
        </Button>
      </div>
      <Button variant="ghost" full onClick={() => setStep('charges')}>
        Back to charges
      </Button>
    </section>
  )

  return (
    <div className="min-h-dvh">
      <AppBar right="home" className="hidden lg:flex" />
      <TwoPane
        mainClassName="px-4 py-6 lg:px-0 lg:py-0 pb-16"
        main={
          <>
            <h1 className="font-warm text-2xl">Who owes what</h1>
            {!split.invariantOk && (
              <div className="banner-enter mt-2 rounded-lg border border-settle-pending bg-red-50 px-3 py-2 text-xs text-settle-pending">
                Totals don't reconcile — this is a bug, please re-check assignments.
              </div>
            )}

            <div className="mt-4 lg:hidden">{payerCard}</div>
            <div className="mt-4">{settleList}</div>

            {/* §15.2 — the delight budget: the rare, earned moment */}
            {allSettled && (
              <div className="settled-stamp mx-auto mt-5 w-fit rotate-[-6deg] rounded border-4 border-settle-paid px-4 py-1 font-warm text-2xl font-bold tracking-widest text-settle-paid">
                SETTLED
              </div>
            )}

            <div className="mt-6 lg:hidden">{shareCard}</div>
          </>
        }
        aside={
          <>
            {payerCard}
            {shareCard}
          </>
        }
      />

      {/* §10.3 — full-screen per-person payment QR in a sheet */}
      <Drawer.Root open={qrPerson !== null} onOpenChange={(o) => !o && setQrPerson(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-30 bg-black/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 rounded-t-xl bg-paper-raised p-6 pb-[max(24px,env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rule" />
            {qrPerson && (
              <div className="flex flex-col items-center gap-3">
                <Drawer.Title className="font-warm text-xl">{qrPerson.name} pays</Drawer.Title>
                <Money paise={split.perPerson[qrPerson.id]?.total ?? 0} className="text-3xl font-bold" />
                <div className="rounded-xl bg-white p-4">
                  <QRCode value={upiFor(qrPerson, bill.people.indexOf(qrPerson))} size={220} aria-label="UPI payment QR" />
                </div>
                <p className="text-center text-[11px] leading-relaxed text-ink-faint">
                  Scan from any UPI app. Amount and payee are prefilled — PIN to confirm.
                </p>
                {platform() === 'android' && (
                  <a
                    href={upiFor(qrPerson, bill.people.indexOf(qrPerson))}
                    className="pressable w-full rounded-lg bg-ink py-3 text-center text-sm font-semibold text-paper"
                  >
                    Open UPI app on this phone
                  </a>
                )}
                {platform() === 'ios' && (
                  <div className="flex w-full gap-2">
                    {iosAppLinks({
                      vpa,
                      payeeName: payer?.name ?? 'Splitty',
                      paise: split.perPerson[qrPerson.id]?.total ?? 0,
                      note: `${bill.merchant ?? 'Bill'} split`,
                      ref: `SPLT${shareCode ?? bill.id}${bill.people.indexOf(qrPerson)}`,
                    }).map((l) => (
                      <a key={l.label} href={l.url} className="pressable flex-1 rounded-lg border border-rule py-2.5 text-center text-xs font-semibold">
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

      <style>{`
        .settled-stamp { opacity: 1; scale: 1; transition: opacity 250ms var(--ease-out), scale 250ms var(--ease-out); }
        @starting-style { .settled-stamp { opacity: 0; scale: 1.4; } }
        @media (prefers-reduced-motion: reduce) { .settled-stamp { scale: 1 !important; } }
      `}</style>
    </div>
  )
}
