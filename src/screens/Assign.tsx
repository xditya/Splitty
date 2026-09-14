// The assignment screen. One hand, standing, noisy restaurant.
// Mental model (matches how people talk): select who shared a thing, tap the
// thing — it splits evenly among them, whole item, one tap. The ⋯ button
// expands the row into exact portions. The ? button walks through all of it.
// The header always answers "how far am I?" — progress, money still unclaimed,
// and every person's running total, in one glance.
import { useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { animate, motion, useReducedMotion } from 'motion/react'
import { useBill } from '../store/bill'
import { allocate, computeSplit, type SplitResult } from '../lib/split'
import { PersonChip } from '../components/Chip'
import { Money, MoneyStatic } from '../components/Money'
import { Button } from '../components/Button'
import { AppBar, HomeButton, TwoPane } from '../components/Shell'
import {
  ChevronUp,
  CircleHelp,
  Ellipsis,
  MessageCircle,
  Minus,
  Plus,
  Undo2,
  X,
} from '../components/icons'
import { AssignChat } from '../components/AssignChat'
import { formatPaise, type Paise } from '../lib/money'
import { firstName } from '../lib/palette'
import { fullyAssigned, unclaimedTotal, unitsUsed, unitsValue } from '../lib/units'
import type { Item, Person } from '../lib/types'
import { clsx } from 'clsx'

/** 1.5 → "1.5", 2 → "2". Units are halves; never show trailing zeros. */
const unitCount = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 })

/**
 * Swipe-to-clear gesture: pointer capture, grab offset respected, 10px
 * hysteresis, 1:1 tracking, velocity (>0.11 px/ms) OR distance dismissal,
 * rubber-band the wrong way, spring back carrying release velocity, extra
 * pointers ignored.
 */
function useSwipeToClear(onClear: () => void, onTap: () => void, onLongPress: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const state = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    dragging: false,
    suppressTap: false,
    history: [] as { x: number; t: number }[],
    longPressTimer: 0 as ReturnType<typeof setTimeout> | 0,
  })

  const rubberband = (over: number, dim = 80, c = 0.55) =>
    (over * dim * c) / (dim + c * Math.abs(over))

  const clearLongPress = () => {
    if (state.current.longPressTimer) clearTimeout(state.current.longPressTimer)
    state.current.longPressTimer = 0
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (state.current.pointerId !== null) return // ignore additional touches mid-drag
    state.current.pointerId = e.pointerId
    state.current.startX = e.clientX
    state.current.startY = e.clientY
    state.current.dragging = false
    state.current.suppressTap = false
    state.current.history = [{ x: e.clientX, t: performance.now() }]
    state.current.longPressTimer = setTimeout(() => {
      state.current.suppressTap = true
      state.current.pointerId = null
      onLongPress()
    }, 450)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = state.current
    if (s.pointerId !== e.pointerId) return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (!s.dragging) {
      if (Math.hypot(dx, dy) > 10) clearLongPress() // moved — not a long-press
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        s.dragging = true
        s.suppressTap = true
        ref.current?.setPointerCapture(e.pointerId)
      } else {
        return
      }
    }
    s.history.push({ x: e.clientX, t: performance.now() })
    if (s.history.length > 6) s.history.shift()
    const x = dx < 0 ? dx : rubberband(dx) // leftward is the gesture; rightward rubber-bands
    if (ref.current) ref.current.style.transform = `translateX(${x}px)` // direct: cheapest repaint
  }

  const finish = (e: React.PointerEvent) => {
    const s = state.current
    if (s.pointerId !== e.pointerId) return
    clearLongPress()
    s.pointerId = null
    if (!s.dragging) {
      if (!s.suppressTap && e.type === 'pointerup') onTap()
      return
    }
    const dx = e.clientX - s.startX
    const hist = s.history
    const dt = hist.length > 1 ? hist[hist.length - 1].t - hist[0].t : 1
    const dpx = hist.length > 1 ? hist[hist.length - 1].x - hist[0].x : 0
    const velocity = dt > 0 ? dpx / dt : 0 // px/ms, signed

    if (dx < -72 || velocity < -0.11) onClear() // flick counts

    const el = ref.current
    if (el) {
      // spring back from the presentation value, carrying release velocity
      animate(dx < 0 ? dx : rubberband(dx), 0, {
        type: 'spring',
        bounce: 0,
        duration: 0.4,
        velocity: velocity * 1000,
        onUpdate: (v) => (el.style.transform = `translateX(${v}px)`),
        onComplete: () => (el.style.transform = ''),
      })
    }
  }

  return { ref, onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish }
}

// Rejection feedback: a short buzz + row shake ONLY when a tap is blocked.
// Successful assigns stay silent — they happen constantly.
const buzz = () => navigator.vibrate?.(35)

/** One line of plain English under the item name: who has it, for how much. */
function assignedNote(item: Item, holders: [Person, number][], parts: Record<string, Paise>) {
  const qty = Math.max(1, item.qty)
  const used = unitsUsed(item.shares)
  // Incomplete: the count is the whole story, and the money would lie —
  // allocate() bills the entire line to whoever is on it until the last unit
  // is claimed. Same wording as the portions editor's footer, on purpose.
  if (used < qty - 0.02) return { text: `${unitCount(used)} of ${qty} assigned`, amber: true }
  if (holders.length === 1) return { text: `${firstName(holders[0][0].name)} only`, amber: false }
  const everyoneOneUnit =
    item.qty > 1 && holders.length === item.qty && holders.every(([, n]) => Math.abs(n - 1) < 0.01)
  if (everyoneOneUnit) return { text: 'one each', amber: false }
  const even = holders.every(([, n]) => Math.abs(n - holders[0][1]) < 0.01)
  // Even units can still differ by a paise after Hamilton rounding — that is
  // still "each" to a human, so read the amount off the first holder.
  if (even) return { text: `${formatPaise(parts[holders[0][0].id] ?? 0)} each`, amber: false }
  // Uneven: name the portions in avatar order — the avatars alongside are the
  // legend, so `1/2 · 1/2 · 1` says who had what without a second line.
  return { text: holders.map(([, n]) => unitsValue(n)).join(' · '), amber: false }
}

/** Exact portions, inline: half-unit steppers for every person, committed on Apply. */
function PortionsPanel({
  item,
  onClose,
  onOpened,
}: {
  item: Item
  onClose: () => void
  onOpened: () => void
}) {
  const { bill, updateItem } = useBill()
  const reduced = useReducedMotion()
  const [units, setUnits] = useState<Record<string, number>>(() =>
    Object.fromEntries(bill.people.map((p) => [p.id, item.shares[p.id] ?? 0])),
  )

  const qty = Math.max(1, item.qty)
  const total = Object.values(units).reduce((a, b) => a + b, 0)
  const remaining = qty - total

  const step = (pid: string, delta: number) => {
    if (delta > 0 && total + delta > qty + 0.001) {
      buzz()
      return
    }
    setUnits({ ...units, [pid]: Math.max(0, (units[pid] ?? 0) + delta) })
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
      onAnimationComplete={onOpened}
      className="overflow-hidden"
    >
      <div className="flex flex-col gap-1.5 px-3 pb-3">
        {bill.people.map((p) => {
          const n = units[p.id] ?? 0
          return (
            <div key={p.id} className="flex items-center gap-2">
              <PersonChip person={p} size="sm" active={n > 0} />
              <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
              <button
                type="button"
                aria-label={`Less for ${p.name}`}
                onClick={() => step(p.id, -0.5)}
                disabled={n <= 0}
                className="pressable flex h-8 w-8 items-center justify-center rounded-lg border border-rule bg-paper-raised disabled:opacity-30"
              >
                <Minus size={13} />
              </button>
              <span className="tabular w-8 text-center font-mono text-[13px] font-semibold">
                {unitsValue(n)}
              </span>
              <button
                type="button"
                aria-label={`More for ${p.name}`}
                onClick={() => step(p.id, 0.5)}
                disabled={remaining < 0.499}
                className="pressable flex h-8 w-8 items-center justify-center rounded-lg border border-rule bg-paper-raised disabled:opacity-30"
              >
                <Plus size={13} />
              </button>
            </div>
          )
        })}
        <div className="mt-0.5 flex items-center justify-between">
          <span
            className={clsx(
              'text-[11px]',
              // same phrase, same ink as the row summary — see assignedNote
              remaining > 0.001 ? 'font-semibold text-amber-700' : 'text-ink-faint',
            )}
          >
            {unitCount(total)} of {qty} assigned
          </span>
          <Button
            variant="primary"
            size="sm"
            className="px-4"
            disabled={total <= 0.001}
            onClick={() => {
              updateItem(item.id, {
                shares: Object.fromEntries(Object.entries(units).filter(([, v]) => v > 0)),
              })
              onClose()
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

function AssignRow({
  item,
  expanded,
  onExpand,
}: {
  item: Item
  expanded: boolean
  onExpand: (id: string | null) => void
}) {
  const { bill, activePersonIds, tapAssign, clearShares } = useBill()
  const [rejecting, setRejecting] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  // Called once the panel has finished growing, so we scroll against its real
  // height, not the collapsed stub. `nearest` is the point: a row already in
  // the clear stays put, and one that isn't moves the least it can. The scroll
  // margins below stand in for the sticky header and the tray.
  const revealEditor = () =>
    editorRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })

  const gesture = useSwipeToClear(
    () => clearShares(item.id),
    () => {
      if (tapAssign(item.id) !== 'assigned') {
        buzz()
        setRejecting(true)
      }
    },
    () => onExpand(item.id),
  )

  const qtyPrefix = item.qty > 1 ? `${item.qty}× ` : ''

  if (expanded) {
    return (
      <div
        ref={editorRef}
        className="scroll-mt-60 scroll-mb-36 bg-paper shadow-[inset_0_0_0_1.5px_var(--color-ink)] lg:scroll-mt-6 lg:scroll-mb-6"
      >
        <button
          type="button"
          aria-expanded
          onClick={() => onExpand(null)}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm font-bold">
              {qtyPrefix && <span className="text-ink-faint">{qtyPrefix}</span>}
              {item.name || 'Unnamed item'}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold">Exact portions — half steps OK</div>
          </div>
          <MoneyStatic paise={item.lineTotal} className="text-sm" />
          <ChevronUp size={14} aria-hidden />
        </button>
        <PortionsPanel item={item} onClose={() => onExpand(null)} onOpened={revealEditor} />
      </div>
    )
  }

  const holders = Object.entries(item.shares)
    .filter(([, n]) => n > 0)
    .map(([pid, n]) => [bill.people.find((p) => p.id === pid), n] as [Person | undefined, number])
    .filter((h): h is [Person, number] => Boolean(h[0]))
  const parts = holders.length > 0 ? allocate(item.lineTotal, item.shares) : {}
  const note = holders.length > 0 ? assignedNote(item, holders, parts) : null
  const selectedNames = bill.people
    .filter((p) => activePersonIds.includes(p.id))
    .map((p) => firstName(p.name))

  return (
    <div className="relative isolate overflow-hidden">
      <div className="absolute inset-y-0 right-3 flex items-center text-[11px] font-bold uppercase tracking-wide text-amber-flag">
        clear
      </div>
      <div
        ref={gesture.ref}
        onPointerDown={gesture.onPointerDown}
        onPointerMove={gesture.onPointerMove}
        onPointerUp={gesture.onPointerUp}
        onPointerCancel={gesture.onPointerCancel}
        onAnimationEnd={() => setRejecting(false)}
        className={clsx(
          'pressable-row relative flex min-h-14 cursor-pointer touch-pan-y items-center gap-2 border-b border-dashed border-rule px-3 py-2.5 select-none',
          holders.length === 0 || item.confidence === 'low' ? 'bg-amber-50' : 'bg-paper-raised',
          rejecting && 'row-reject',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm">
            {qtyPrefix && <span className="text-ink-faint">{qtyPrefix}</span>}
            {item.name || 'Unnamed item'}
          </div>
          {note && (
            <div className="mt-1 flex items-center gap-0.5">
              {holders.map(([p], i) => (
                <PersonChip
                  key={p.id}
                  person={p}
                  size="xs"
                  className={clsx('shrink-0 border-[1.5px] border-paper-raised', i > 0 && '-ml-1.5')}
                />
              ))}
              <span
                className={clsx(
                  'tabular ml-1 min-w-0 truncate font-mono text-[10px]',
                  // amber-flag (#d97706) is the flag colour for rules and
                  // borders; as text it only reaches 3.1:1 on paper, so every
                  // small amber word on this screen — this note, the portions
                  // footer, the unclaimed pill, the hint chip — uses amber-700
                  // (4.9:1) instead.
                  note.amber ? 'font-semibold text-amber-700' : 'text-ink-faint',
                )}
              >
                {note.text}
              </span>
            </div>
          )}
          {holders.length === 0 && (
            <div className="mt-1">
              <span className="inline-flex h-[22px] items-center rounded-full border-[1.5px] border-dashed border-amber-flag px-2 text-[10px] font-semibold text-amber-700">
                {selectedNames.length > 0
                  ? `Tap to give to ${selectedNames.join(' + ')}`
                  : 'Pick people below first'}
              </span>
            </div>
          )}
        </div>
        <MoneyStatic paise={item.lineTotal} className="text-sm" />
        <button
          type="button"
          aria-label={`Exact portions for ${item.name || 'item'}`}
          aria-expanded={false}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onExpand(item.id)
          }}
          className="pressable flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-rule bg-paper text-ink-faint"
        >
          <Ellipsis size={14} aria-hidden />
        </button>
      </div>
    </div>
  )
}

/** The brush, as pills — mobile tray row and desktop aside share it. */
function PeoplePills() {
  const { bill, activePersonIds, togglePerson } = useBill()
  return (
    <>
      {bill.people.map((p) => {
        const on = activePersonIds.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => togglePerson(p.id)}
            className={clsx(
              'pressable inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border py-0 pr-3 pl-1.5 text-xs font-semibold',
              on ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-faint hover:bg-paper',
            )}
          >
            <PersonChip person={p} size="sm" active={on} />
            {firstName(p.name)}
          </button>
        )
      })}
    </>
  )
}

/**
 * `Everyone` · `None` · `Edit people` — the tray's label row, right side.
 * These are the old selection pills, promoted out of the scrolling row. Each
 * shows only when it would do something, so the row never offers a dead tap
 * and never holds more than three: at most one of Everyone/None is redundant
 * at any moment. No aria-pressed — the label changes what it does, not a
 * state it is in.
 */
function TrayActions({ onManage }: { onManage: () => void }) {
  const { bill, activePersonIds, selectAll, clearSelection } = useBill()
  const allSelected = activePersonIds.length === bill.people.length && bill.people.length > 0
  return (
    <div className="flex items-center gap-3">
      {bill.people.length > 0 && !allSelected && (
        <button
          type="button"
          onClick={selectAll}
          className="pressable py-1 text-[11px] font-semibold text-ink"
        >
          Everyone
        </button>
      )}
      {activePersonIds.length > 0 && (
        <button
          type="button"
          onClick={clearSelection}
          className="pressable banner-enter py-1 text-[11px] font-semibold text-ink-faint"
        >
          None
        </button>
      )}
      <button
        type="button"
        onClick={onManage}
        className="pressable py-1 text-[11px] font-semibold text-ink-faint"
      >
        Edit people
      </button>
    </div>
  )
}

/** Undo · Back · Continue — one row, thumb reach. */
function ActionRow({ unassigned }: { unassigned: number }) {
  const { bill, setStep, undoLast, undoSnapshot } = useBill()
  return (
    <div className="flex gap-2">
      <button
        type="button"
        aria-label="Undo last assignment change"
        disabled={!undoSnapshot}
        onClick={undoLast}
        className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rule text-ink-faint disabled:pointer-events-none disabled:opacity-40"
      >
        <Undo2 size={16} aria-hidden />
      </button>
      <Button size="sm" className="h-10 flex-1 text-[13px]" onClick={() => setStep('items')}>
        Back
      </Button>
      <Button
        size="sm"
        variant="primary"
        className="h-10 flex-2 text-[13px]"
        disabled={unassigned > 0 || bill.items.length === 0}
        onClick={() => setStep('charges')}
      >
        {unassigned > 0 ? `Continue — ${unassigned} left` : 'Continue'}
      </Button>
    </div>
  )
}

/** Progress track + `5 / 6 items`. Always visible, header and aside alike. */
function ProgressRow({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-rule">
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-300 ease-out"
          style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
        />
      </div>
      <span className="tabular shrink-0 text-[11px] font-semibold text-ink-faint">
        {done} / {total} items
      </span>
    </div>
  )
}

/** `₹180.00 unclaimed`. Nothing at all once everything is claimed. */
function UnclaimedPill({ paise }: { paise: Paise }) {
  if (paise <= 0) return null
  return (
    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
      <Money paise={paise} /> unclaimed
    </span>
  )
}

/** Per-person cards: selection and running total are the same control. */
function PersonCards({ split }: { split: SplitResult }) {
  const { bill, activePersonIds, togglePerson } = useBill()
  if (bill.people.length === 0) return null
  return (
    <div className="flex gap-1.5">
      {bill.people.map((p) => {
        const on = activePersonIds.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => togglePerson(p.id)}
            className={clsx(
              'pressable flex min-w-0 flex-1 flex-col items-center gap-[3px] rounded-[10px] border-[1.5px] px-0.5 pt-2 pb-1.5',
              on ? 'border-ink bg-paper-raised' : 'border-rule',
            )}
          >
            <PersonChip person={p} size="card" active={on} />
            <span
              className={clsx(
                'max-w-full truncate text-[11px] font-semibold',
                on ? 'text-ink' : 'text-ink-faint',
              )}
            >
              {firstName(p.name)}
            </span>
            <Money paise={split.perPerson[p.id]?.total ?? 0} className="text-[10px] text-ink-faint" />
          </button>
        )
      })}
    </div>
  )
}

/** What a tap does right now, plus the two escape hatches (chat, help). */
function InstructionRow({
  onChat,
  onHelp,
}: {
  onChat: () => void
  onHelp: () => void
}) {
  const { bill, activePersonIds } = useBill()
  const names = bill.people
    .filter((p) => activePersonIds.includes(p.id))
    .map((p) => firstName(p.name))
  return (
    <div className="flex items-start gap-0.5">
      <p className="banner-enter min-w-0 flex-1 py-1 text-xs leading-relaxed text-ink-faint">
        {names.length === 0 ? (
          <>Pick people below, then tap what they had.</>
        ) : (
          <>
            Tapping an item gives it to{' '}
            <span className="font-semibold text-ink">{names.join(' + ')}</span> — it splits evenly.
            The <span className="font-bold">⋯</span> button sets exact portions.
          </>
        )}
      </p>
      <button
        type="button"
        aria-label="Assign by chat"
        onClick={onChat}
        className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-ink/5 hover:text-ink"
      >
        <MessageCircle size={16} aria-hidden />
      </button>
      <button
        type="button"
        aria-label="How assigning works"
        onClick={onHelp}
        className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-ink/5 hover:text-ink"
      >
        <CircleHelp size={16} aria-hidden />
      </button>
    </div>
  )
}

/** Per-person running totals, desktop aside. */
function RunningTotals({ split }: { split: SplitResult }) {
  const { bill } = useBill()
  return (
    <div className="divide-y divide-rule">
      {bill.people.map((p) => (
        <div key={p.id} className="flex items-center gap-2 py-2">
          <PersonChip person={p} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
          <Money paise={split.perPerson[p.id]?.total ?? 0} className="text-sm font-semibold" />
        </div>
      ))}
    </div>
  )
}

/** Add/remove people without leaving the flow. Remove is two-tap (armed red). */
function PeopleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bill, addPerson, removePerson, selectOnly } = useBill()
  const [name, setName] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const submit = () => {
    const n = name.trim()
    if (!n) return
    addPerson(n)
    const people = useBill.getState().bill.people
    selectOnly(people[people.length - 1].id)
    setName('')
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setConfirmingId(null)
          onClose()
        }
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-30 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 max-h-[80svh] overflow-y-auto rounded-t-xl bg-paper-raised p-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-rule" />
          <Drawer.Title className="font-warm text-lg">People</Drawer.Title>
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Add someone"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-rule bg-paper px-3 text-sm"
            />
            <Button variant="primary" disabled={!name.trim()} onClick={submit}>
              Add
            </Button>
          </div>
          <div className="mt-3 max-h-[40svh] divide-y divide-rule overflow-y-auto rounded-lg border border-rule">
            {bill.people.map((p) => {
              const confirming = confirmingId === p.id
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                  <PersonChip person={p} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  {confirming ? (
                    <button
                      type="button"
                      aria-label={`Confirm removing ${p.name}`}
                      onClick={() => {
                        removePerson(p.id)
                        setConfirmingId(null)
                      }}
                      className="pressable banner-enter min-h-9 rounded-lg bg-settle-pending px-3 text-xs font-semibold text-white"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => setConfirmingId(p.id)}
                      className="pressable flex h-10 w-10 items-center justify-center rounded-lg text-ink-faint hover:bg-ink/5"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            Removing someone re-splits their items evenly among whoever's left on them.
          </p>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/** The ? walkthrough. */
function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps: [string, string][] = [
    ['1', 'Pick people in the tray — whoever shared something. One, several, or Everyone. "None" clears the pick.'],
    ['2', 'Tap the item they had. It becomes theirs, split evenly. A tap sets exactly who is on the item — tap again with a different pick to correct it.'],
    ['3', 'Tap ⋯ on an item for exact portions (someone had 2, two people shared 1…). Step someone to 0 to take them off.'],
    ['4', 'Swipe an item left to clear it. The ↩ button undoes the last change.'],
    ['5', 'Or tap Chat and just type who ate what.'],
  ]
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-30 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 max-h-[80svh] overflow-y-auto rounded-t-xl bg-paper-raised p-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-rule" />
          <Drawer.Title className="font-warm text-lg">How assigning works</Drawer.Title>
          <ol className="mt-3 space-y-3">
            {steps.map(([n, text]) => (
              <li key={n} className="flex items-start gap-3 text-sm leading-relaxed">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rule text-[11px] font-bold text-ink-faint">
                  {n}
                </span>
                {text}
              </li>
            ))}
          </ol>
          <Button full className="mt-4" onClick={onClose}>
            Got it
          </Button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

export function AssignScreen() {
  const { bill } = useBill()
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const split = computeSplit(bill)
  const done = bill.items.filter((i) => fullyAssigned(i.shares, i.qty)).length
  const unassigned = bill.items.length - done
  const unclaimed = unclaimedTotal(bill.items)

  return (
    <div className="isolate flex min-h-dvh flex-col">
      <AppBar right="home" className="hidden lg:flex" />

      {/* mobile: the always-on progress header — title, unclaimed, bar, people */}
      <header className="material-bar sticky top-0 z-10 lg:hidden">
        <div className="mx-auto max-w-md px-4 pt-1 pb-3">
          <div className="flex items-center gap-2">
            <HomeButton className="-ml-2 shrink-0" />
            <h1 className="min-w-0 flex-1 font-warm text-xl">Who had what?</h1>
            <UnclaimedPill paise={unclaimed} />
          </div>
          <div className="mt-2.5">
            <ProgressRow done={done} total={bill.items.length} />
          </div>
          <div className="mt-3">
            <PersonCards split={split} />
          </div>
          <div className="mt-1.5">
            <InstructionRow onChat={() => setChatOpen(true)} onHelp={() => setHelpOpen(true)} />
          </div>
        </div>
        <div className="scroll-edge absolute inset-x-0 top-full" />
      </header>

      <TwoPane
        mainClassName="flex-1 pb-48 lg:pb-10"
        main={
          <>
            <div className="hidden lg:block lg:space-y-3 lg:pb-2">
              <div className="flex items-center gap-3">
                <h1 className="min-w-0 flex-1 font-warm text-2xl">Who had what?</h1>
                <UnclaimedPill paise={unclaimed} />
              </div>
              <ProgressRow done={done} total={bill.items.length} />
              <InstructionRow onChat={() => setChatOpen(true)} onHelp={() => setHelpOpen(true)} />
            </div>
            <div className="torn-edge mx-3 mt-1 bg-paper-raised pb-3 shadow-sm lg:mx-0">
              {bill.items.map((item) => (
                <AssignRow
                  key={item.id}
                  item={item}
                  expanded={expandedItemId === item.id}
                  onExpand={setExpandedItemId}
                />
              ))}
            </div>
          </>
        }
        aside={
          <>
            <section className="rounded-lg border border-rule bg-paper-raised p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Assigning to
                </h2>
                <TrayActions onManage={() => setPeopleOpen(true)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <PeoplePills />
              </div>
            </section>
            <section className="rounded-lg border border-rule bg-paper-raised p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Running totals
              </h2>
              <RunningTotals split={split} />
            </section>
            <section className="rounded-lg border border-rule bg-paper-raised p-4">
              <ActionRow unassigned={unassigned} />
            </section>
          </>
        }
      />

      {/* mobile: bottom tray — the brush in thumb reach, labelled */}
      <footer className="material-bar fixed inset-x-0 bottom-0 z-20 border-t border-dashed border-rule pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        <div className="scroll-edge absolute inset-x-0 bottom-full rotate-180" />
        <div className="mx-auto max-w-md px-3 pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Assigning to
            </span>
            <TrayActions onManage={() => setPeopleOpen(true)} />
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            <PeoplePills />
          </div>
          <div className="mt-2">
            <ActionRow unassigned={unassigned} />
          </div>
        </div>
      </footer>

      <AssignChat open={chatOpen} onOpenChange={setChatOpen} />
      <PeopleSheet open={peopleOpen} onClose={() => setPeopleOpen(false)} />
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
