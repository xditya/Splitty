// PLAN.md §8 charges screen — one row per *decision*: CGST+SGST collapse into a
// single GST row; mode applies to every underlying charge of that kind. The
// consequence line makes the tradeoff visible before anyone argues.
import { useMemo } from 'react'
import { useBill } from '../store/bill'
import { computeSplit } from '../lib/split'
import { Money } from '../components/Money'
import { MoneyStatic } from '../components/Money'
import { Popover } from '../components/Popover'
import { SegmentedControl } from '../components/SegmentedControl'
import { sum } from '../lib/money'
import type { Charge, ChargeKind, SplitMode } from '../lib/types'

const MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'proportional', label: 'Proportional' },
  { value: 'scoped', label: 'Scoped' },
]

const GROUP_LABEL: Partial<Record<ChargeKind, string>> = {
  gst: 'GST',
  vat: 'VAT',
  service: 'Service charge',
  tip: 'Tip',
  packaging: 'Packaging',
  delivery: 'Delivery',
  discount: 'Discount',
  rounding: 'Rounding',
}

export function ChargesScreen() {
  const { bill, setModeForKind, removeCharge, setStep } = useBill()
  const split = computeSplit(bill)

  // §8 — group charges by kind; each group is one row, one decision
  const groups = useMemo(() => {
    const byKind = new Map<ChargeKind, Charge[]>()
    for (const c of bill.charges) {
      byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c])
    }
    return [...byKind.entries()]
  }, [bill.charges])

  const consequence = (charges: Charge[]) => {
    const ids = new Set(charges.map((c) => c.id))
    const perPerson = bill.people.map((p) =>
      sum(
        Object.entries(split.perPerson[p.id]?.charges ?? {})
          .filter(([cid]) => ids.has(cid))
          .map(([, v]) => v),
      ),
    )
    const min = Math.min(...perPerson)
    const max = Math.max(...perPerson)
    return { min, max, same: min === max }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 pb-32">
      <h1 className="font-warm text-2xl">Taxes & charges</h1>
      <p className="mt-1 text-xs text-ink-faint">How should each one be divided?</p>

      <div className="mt-5 space-y-4">
        {groups.length === 0 && (
          <p className="rounded-md border border-dashed border-rule px-3 py-6 text-center text-xs text-ink-faint">
            No charges on this bill. Nice.
          </p>
        )}
        {groups.map(([kind, charges]) => {
          const total = sum(charges.map((c) => c.amount))
          const c9 = consequence(charges)
          const isRounding = kind === 'rounding'
          return (
            <section key={kind} className="rounded-md border border-rule bg-paper-raised p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{GROUP_LABEL[kind] ?? charges[0].label ?? 'Charge'}</span>
                {kind === 'service' && (
                  <Popover>
                    Service charge isn't mandatory in India (CCPA guidelines, 2022). You can ask the
                    restaurant to remove it — or remove it here.
                  </Popover>
                )}
                {charges.length > 1 && (
                  <span className="text-[10px] text-ink-faint">({charges.map((c) => c.label || c.kind).join(' + ')})</span>
                )}
                <span className="ml-auto">
                  <MoneyStatic paise={total} className="text-sm font-bold" />
                </span>
              </div>

              {isRounding ? (
                <p className="mt-2 text-xs text-ink-faint">
                  Goes to whoever paid — pick the payer on the next screen.
                </p>
              ) : (
                <>
                  <div className="mt-3">
                    <SegmentedControl
                      options={MODE_OPTIONS}
                      value={charges[0].mode === 'custom' ? 'proportional' : charges[0].mode}
                      onChange={(m) => setModeForKind(kind, m)}
                    />
                  </div>
                  {/* the live consequence one-liner (§8) */}
                  <p className="mt-2 text-xs text-ink-faint" aria-live="polite">
                    {c9.same ? (
                      <>
                        <Money paise={c9.min} className="font-bold" /> each
                      </>
                    ) : (
                      <>
                        <Money paise={c9.min} className="font-bold" /> – <Money paise={c9.max} className="font-bold" /> based on order
                      </>
                    )}
                  </p>
                </>
              )}

              {kind === 'service' && (
                <button
                  type="button"
                  onClick={() => charges.forEach((c) => removeCharge(c.id))}
                  className="pressable mt-3 rounded-md border border-rule px-3 py-1.5 text-xs font-bold"
                >
                  Remove service charge
                </button>
              )}
            </section>
          )
        })}
      </div>

      <div className="mt-8 flex gap-2">
        <button type="button" onClick={() => setStep('assign')} className="pressable rounded-md border border-rule px-4 py-2 text-sm">
          Back
        </button>
        <button type="button" onClick={() => setStep('summary')} className="pressable flex-1 rounded-md bg-ink py-3 text-sm font-bold text-paper">
          See who owes what
        </button>
      </div>
    </div>
  )
}
