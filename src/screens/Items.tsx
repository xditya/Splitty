// PLAN.md — item review/edit. Reconciliation banner (§5.1), engine badge (§4.3),
// low-confidence rows pre-highlighted with first one focused (§4.5).
// Desktop (lg+): editable receipt left, charges + bill total right.
import { useEffect, useRef, useState } from 'react'
import { useBill } from '../store/bill'
import { reconcile } from '../lib/split'
import { formatPaise, parseMoney } from '../lib/money'
import { MoneyStatic } from '../components/Money'
import { Button } from '../components/Button'
import { AppBar, HomeButton, TwoPane } from '../components/Shell'
import { Plus, X } from '../components/icons'
import type { Category, ChargeKind, Item } from '../lib/types'
import { clsx } from 'clsx'

const CATEGORIES: Category[] = ['food', 'alcohol', 'other']
const KINDS: ChargeKind[] = ['gst', 'vat', 'service', 'tip', 'packaging', 'delivery', 'discount', 'rounding', 'other']

function MoneyInput({
  paise,
  onCommit,
  className,
  inputRef,
}: {
  paise: number
  onCommit: (p: number) => void
  className?: string
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input
      ref={inputRef}
      inputMode="decimal"
      value={text ?? (paise === 0 ? '' : (paise / 100).toFixed(2))}
      placeholder="0.00"
      onFocus={(e) => {
        setText(paise === 0 ? '' : (paise / 100).toFixed(2))
        const el = e.target
        requestAnimationFrame(() => el.select()) // typing replaces, no backspacing needed
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null) onCommit(parseMoney(text) ?? 0)
        setText(null)
      }}
      className={clsx('tabular min-h-11 rounded-lg border border-rule bg-paper-raised px-2 text-right font-mono text-sm', className)}
    />
  )
}

// Draft-while-editing: committing on every keystroke would clamp "" back to 1,
// making backspace a no-op ("5" after an unclearable "1" typed as 15).
function QtyInput({ qty, onCommit }: { qty: number; onCommit: (q: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input
      inputMode="numeric"
      aria-label="Quantity"
      value={text ?? String(qty)}
      onFocus={(e) => {
        setText(String(qty))
        const el = e.target
        requestAnimationFrame(() => el.select())
      }}
      onChange={(e) => {
        if (/^\d{0,3}$/.test(e.target.value)) setText(e.target.value)
      }}
      onBlur={() => {
        if (text !== null) onCommit(Math.max(1, parseInt(text || '1', 10) || 1))
        setText(null)
      }}
      className="tabular min-h-11 w-12 rounded-lg border border-rule bg-paper-raised px-1 text-center font-mono text-sm"
    />
  )
}

function ItemRow({ item, autoFocus }: { item: Item; autoFocus: boolean }) {
  const { updateItem, removeItem } = useBill()
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) nameRef.current?.focus() // §4.5 — focus the first low-confidence row
  }, [autoFocus])

  return (
    <div className={clsx('space-y-2 border-b border-dashed border-rule px-3 py-3', item.confidence === 'low' && 'bg-amber-50')}>
      <div className="flex gap-2">
        <input
          ref={nameRef}
          value={item.name}
          placeholder="Item name"
          onChange={(e) => updateItem(item.id, { name: e.target.value, confidence: 'high' })}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-rule bg-paper-raised px-2 font-mono text-sm"
        />
        <QtyInput qty={item.qty} onCommit={(q) => updateItem(item.id, { qty: q })} />
        <MoneyInput paise={item.lineTotal} onCommit={(p) => updateItem(item.id, { lineTotal: p, confidence: 'high' })} className="w-24" />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => updateItem(item.id, { category: c })}
              aria-pressed={item.category === c}
              className={clsx(
                'pressable rounded-full border px-2.5 py-1 text-[11px] font-medium',
                item.category === c ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-faint hover:bg-paper',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => removeItem(item.id)}
          aria-label="Delete item"
          className="pressable ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint hover:bg-ink/5"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

export function ItemsScreen() {
  const { bill, addItem, addCharge, updateCharge, removeCharge, setBillTotal, setMerchant, setStep } = useBill()
  const rec = reconcile(bill.items, bill.charges, bill.total || null)
  const firstLowId = bill.items.find((i) => i.confidence === 'low')?.id

  const reconciliationBanner = rec.mismatch && (
    <div className="banner-enter rounded-lg border border-amber-flag/40 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-flag">
      Lines add up to {formatPaise(rec.computed)}, bill says {formatPaise(bill.total)}. Check the
      highlighted rows.
    </div>
  )

  const chargesEditor = (
    <>
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        Taxes & charges
      </h2>
      <div className="mt-2 space-y-2">
        {bill.charges.map((c) => (
          <div key={c.id} className="flex gap-2">
            <input
              value={c.label}
              placeholder="Label (e.g. CGST 2.5%)"
              onChange={(e) => updateCharge(c.id, { label: e.target.value })}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-rule bg-paper-raised px-2 text-sm"
            />
            <select
              value={c.kind}
              aria-label="Charge kind"
              onChange={(e) => updateCharge(c.id, { kind: e.target.value as ChargeKind })}
              className="min-h-11 rounded-lg border border-rule bg-paper-raised px-1 text-xs"
            >
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <MoneyInput paise={c.amount} onCommit={(p) => updateCharge(c.id, { amount: p })} className="w-24" />
            <button
              type="button"
              onClick={() => removeCharge(c.id)}
              aria-label="Delete charge"
              className="pressable flex min-w-8 items-center justify-center text-ink-faint hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <Button size="sm" onClick={() => addCharge()} className="border-dashed text-ink-faint">
          <Plus size={14} />
          Add charge
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-between border-t-2 border-ink pt-3">
        <span className="text-sm font-semibold uppercase tracking-wide">Bill total</span>
        <div className="flex items-center gap-2">
          <MoneyInput paise={bill.total} onCommit={setBillTotal} className="w-28" />
          {!bill.total && <MoneyStatic paise={rec.computed} className="text-xs text-ink-faint" />}
        </div>
      </div>
    </>
  )

  const navButtons = (
    <div className="flex gap-2">
      <Button onClick={() => setStep('people')}>Back</Button>
      <Button variant="primary" className="flex-1" disabled={bill.items.length === 0} onClick={() => setStep('assign')}>
        Assign items
      </Button>
    </div>
  )

  return (
    <div className="min-h-dvh">
      <AppBar right="home" className="hidden lg:flex" />
      <TwoPane
        mainClassName="px-4 py-6 lg:px-0 lg:py-0"
        main={
          <>
            <div className="flex items-center justify-between gap-2">
              <h1 className="flex-1 font-warm text-2xl">The bill</h1>
              {/* §4.3 — engine badge sets accuracy expectations */}
              <span className="rounded-full border border-rule px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                {bill.engine === 'manual' ? 'manual entry' : bill.engine === 'tesseract' ? 'on-device scan' : bill.engine}
              </span>
              <HomeButton className="lg:hidden" />
            </div>

            <input
              value={bill.merchant ?? ''}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Restaurant (optional)"
              className="mt-3 min-h-11 w-full rounded-lg border border-rule bg-paper-raised px-3 text-sm"
            />

            <div className="mt-3 lg:hidden">{reconciliationBanner}</div>

            <section className="torn-edge mt-4 bg-paper-raised pb-3 shadow-sm">
              {bill.items.map((item, i) => (
                <div key={item.id} className="receipt-reveal" style={{ '--reveal-i': Math.min(i, 12) } as React.CSSProperties}>
                  <ItemRow item={item} autoFocus={item.id === firstLowId} />
                </div>
              ))}
              <Button size="sm" onClick={() => addItem()} className="mx-3 mt-3 border-dashed text-ink-faint">
                <Plus size={14} />
                Add item
              </Button>
            </section>

            <section className="mt-6 lg:hidden">{chargesEditor}</section>
            <div className="mt-8 lg:mt-6 lg:hidden">{navButtons}</div>
            <div className="hidden pb-10 lg:mt-6 lg:block">{navButtons}</div>
          </>
        }
        aside={
          <>
            {reconciliationBanner && <section>{reconciliationBanner}</section>}
            <section className="rounded-lg border border-rule bg-paper-raised p-4">{chargesEditor}</section>
          </>
        }
      />
    </div>
  )
}
