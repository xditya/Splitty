// The assignment screen. One hand, standing, noisy restaurant.
// Mental model (matches how people talk): select who shared a thing, tap the
// thing — it splits evenly among them, whole item, one tap. Long-press opens
// exact portions. Badge ✕ takes a person off an item. The ? button walks
// through all of it.
import { useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { animate } from 'motion/react'
import { useBill } from '../store/bill'
import { computeSplit, type SplitResult } from '../lib/split'
import { PersonChip } from '../components/Chip'
import { Money, MoneyStatic } from '../components/Money'
import { Button } from '../components/Button'
import { AppBar, TwoPane } from '../components/Shell'
import { CircleHelp, House, MessageCircle, Minus, Plus, Undo2, UserPlus, X } from '../components/icons'
import { AssignChat } from '../components/AssignChat'
import { initials } from '../lib/palette'
import { fullyAssigned, unitsLabel, unitsUsed } from '../lib/units'
import type { Item } from '../lib/types'
import { clsx } from 'clsx'

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

function AssignRow({ item, onLongPress }: { item: Item; onLongPress: (id: string) => void }) {
  const { bill, tapAssign, clearShares, updateItem } = useBill()
  const [rejecting, setRejecting] = useState(false)

  // Badge ✕ = this person is off the item; the rest re-split evenly.
  const removeFromItem = (personId: string) => {
    const remaining = Object.keys(item.shares).filter((k) => k !== personId && item.shares[k] > 0)
    const qty = Math.max(1, item.qty)
    updateItem(item.id, {
      shares:
        remaining.length > 0
          ? Object.fromEntries(remaining.map((k) => [k, qty / remaining.length]))
          : {},
    })
  }

  const gesture = useSwipeToClear(
    () => clearShares(item.id),
    () => {
      if (tapAssign(item.id) !== 'assigned') {
        buzz()
        setRejecting(true)
      }
    },
    () => onLongPress(item.id),
  )
  const assigned = Object.entries(item.shares).filter(([, n]) => n > 0)
  const used = unitsUsed(item.shares)
  const incomplete = !fullyAssigned(item.shares, item.qty) // amber until every unit is claimed

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
          'pressable-row relative flex min-h-[52px] cursor-pointer touch-pan-y items-center gap-2 border-b border-dashed border-rule bg-paper-raised px-3 py-2 select-none hover:bg-paper',
          incomplete && 'border-l-4 border-l-amber-flag',
          item.confidence === 'low' && 'bg-amber-50',
          rejecting && 'row-reject',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm">
            {item.qty > 1 && <span className="text-ink-faint">{item.qty}× </span>}
            {item.name || 'Unnamed item'}
            {item.qty > 1 && incomplete && used > 0 && (
              <span className="ml-1.5 font-sans text-[10px] text-amber-flag">
                {Math.min(used, item.qty).toLocaleString(undefined, { maximumFractionDigits: 1 })} of{' '}
                {item.qty} assigned
              </span>
            )}
          </div>
          {assigned.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {assigned.map(([pid, n]) => {
                const p = bill.people.find((x) => x.id === pid)
                if (!p) return null
                return (
                  <button
                    key={pid}
                    type="button"
                    aria-label={`Take ${p.name} off ${item.name}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFromItem(pid)
                    }}
                    className="pressable relative flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-bold text-white after:absolute after:-inset-2 after:content-['']"
                    style={{ background: p.color }}
                  >
                    {initials(p.name)}
                    {unitsLabel(n) && <span className="opacity-90">{unitsLabel(n)}</span>}
                    <X size={10} className="opacity-70" aria-hidden />
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <MoneyStatic paise={item.lineTotal} className="text-sm" />
      </div>
    </div>
  )
}

/** The brush — shared by the mobile tray (row) and desktop aside (wrap). */
function PeopleBrush({ onManage }: { onManage: () => void }) {
  const { bill, activePersonIds, togglePerson, selectAll, clearSelection } = useBill()
  const allSelected = activePersonIds.length === bill.people.length && bill.people.length > 0
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
              'pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold',
              on ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-faint hover:bg-paper',
            )}
          >
            <PersonChip person={p} size="sm" active={on} />
            {p.name.split(/\s+/)[0]}
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => (allSelected ? clearSelection() : selectAll())}
        aria-pressed={allSelected}
        className={clsx(
          'pressable min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold',
          allSelected ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-faint hover:bg-paper',
        )}
      >
        Everyone
      </button>
      {activePersonIds.length > 0 && !allSelected && (
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Clear selection"
          className="pressable banner-enter flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-rule px-3 text-xs font-semibold text-ink-faint hover:bg-paper"
        >
          <X size={12} />
          None
        </button>
      )}
      <button
        type="button"
        onClick={onManage}
        aria-label="Add or remove people"
        className="pressable flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-dashed border-rule px-3 text-xs font-semibold text-ink-faint hover:bg-paper"
      >
        <UserPlus size={14} />
        People
      </button>
    </>
  )
}

/** Per-person running totals — chips (mobile header) or rows (desktop aside). */
function RunningTotals({ split, layout }: { split: SplitResult; layout: 'chips' | 'list' }) {
  const { bill, activePersonIds, togglePerson } = useBill()
  if (layout === 'chips') {
    return (
      <>
        {bill.people.map((p) => (
          <PersonChip
            key={p.id}
            person={p}
            active={activePersonIds.length === 0 || activePersonIds.includes(p.id)}
            onClick={() => togglePerson(p.id)}
            label={<Money paise={split.perPerson[p.id]?.total ?? 0} className="text-[10px] text-ink-faint" />}
          />
        ))}
      </>
    )
  }
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

/** Undo + unassigned count + Back/Continue — mobile footer and desktop aside. */
function ContinueBar({ unassigned }: { unassigned: number }) {
  const { bill, setStep, undoLast, undoSnapshot } = useBill()
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          aria-label="Undo last assignment change"
          disabled={!undoSnapshot}
          onClick={undoLast}
        >
          <Undo2 size={16} />
        </Button>
        <div className="min-w-0 truncate text-xs">
          {unassigned > 0 ? (
            <span className="font-semibold text-amber-flag">
              {unassigned} item{unassigned === 1 ? '' : 's'} not fully assigned
            </span>
          ) : (
            <span className="text-ink-faint">All items assigned</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" onClick={() => setStep('items')}>
          Back
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={unassigned > 0 || bill.items.length === 0}
          onClick={() => setStep('charges')}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}

/** Long-press: exact portions with half-unit steppers. */
function ExactSplitSheet({ itemId, onClose }: { itemId: string | null; onClose: () => void }) {
  const { bill, updateItem } = useBill()
  const item = bill.items.find((i) => i.id === itemId)
  const [units, setUnits] = useState<Record<string, number>>({})
  const [forItem, setForItem] = useState<string | null>(null)

  // re-seed local stepper state when a different item opens
  if (item && forItem !== item.id) {
    setForItem(item.id)
    setUnits(Object.fromEntries(bill.people.map((p) => [p.id, item.shares[p.id] ?? 0])))
  }

  if (!item) {
    return (
      <Drawer.Root open={false} onOpenChange={() => {}}>
        <Drawer.Portal>
          <Drawer.Overlay />
          <Drawer.Content>
            <Drawer.Title />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }

  const qty = Math.max(1, item.qty)
  const total = Object.values(units).reduce((a, b) => a + b, 0)
  const remaining = qty - total

  const step = (pid: string, delta: number) => {
    const next = Math.max(0, (units[pid] ?? 0) + delta)
    if (delta > 0 && total + delta > qty + 0.001) {
      buzz()
      return
    }
    setUnits({ ...units, [pid]: next })
  }

  return (
    <Drawer.Root open onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-30 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 max-h-[80svh] overflow-y-auto rounded-t-xl bg-paper-raised p-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-rule" />
          <Drawer.Title className="font-warm text-lg">
            Exact portions — {item.name || 'item'}
          </Drawer.Title>
          <p className="mt-1 text-xs text-ink-faint">
            Half steps, so two people can share one unit. Taps on the main screen split evenly —
            this is for uneven splits.
          </p>
          <div className="mt-3 max-h-[40svh] divide-y divide-rule overflow-y-auto rounded-lg border border-rule">
            {bill.people.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                <PersonChip person={p} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                <button
                  type="button"
                  aria-label={`Less for ${p.name}`}
                  onClick={() => step(p.id, -0.5)}
                  disabled={(units[p.id] ?? 0) <= 0}
                  className="pressable flex h-9 w-9 items-center justify-center rounded-lg border border-rule disabled:opacity-30"
                >
                  <Minus size={14} />
                </button>
                <span className="w-9 text-center font-mono text-sm font-semibold">
                  {unitsLabel(units[p.id] ?? 0) || ((units[p.id] ?? 0) > 0 ? '1' : '0')}
                </span>
                <button
                  type="button"
                  aria-label={`More for ${p.name}`}
                  onClick={() => step(p.id, 0.5)}
                  disabled={remaining < 0.499}
                  className="pressable flex h-9 w-9 items-center justify-center rounded-lg border border-rule disabled:opacity-30"
                >
                  <Plus size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={clsx(remaining > 0.001 ? 'font-semibold text-amber-flag' : 'text-ink-faint')}>
              {total.toLocaleString(undefined, { maximumFractionDigits: 1 })} of {qty} assigned
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setUnits(Object.fromEntries(bill.people.map((p) => [p.id, qty / bill.people.length])))
              }
            >
              Everyone evenly
            </Button>
          </div>
          <Button
            variant="primary"
            full
            className="mt-3"
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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
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
    ['3', 'Long-press an item for exact portions (someone had 2, two people shared 1…).'],
    ['4', 'Tap a name badge on an item to take that person off it. Swipe an item left to clear it. The ↩ button undoes the last change.'],
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
  const { bill, activePersonIds, setStep } = useBill()
  const [sheetItemId, setSheetItemId] = useState<string | null>(null)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const split = computeSplit(bill)
  const unassigned = bill.items.filter((i) => !fullyAssigned(i.shares, i.qty)).length
  const selectedNames = bill.people
    .filter((p) => activePersonIds.includes(p.id))
    .map((p) => p.name.split(/\s+/)[0])

  const instruction =
    activePersonIds.length === 0 ? (
      <>Pick people below, then tap what they had — the item splits evenly among them.</>
    ) : (
      <>
        Tapping an item gives it to{' '}
        <span className="font-semibold text-ink">{selectedNames.join(' + ')}</span>, split evenly.
      </>
    )

  const receipt = (
    <div className="torn-edge mx-3 mt-1 bg-paper-raised pb-3 shadow-sm lg:mx-0">
      {bill.items.map((item) => (
        <AssignRow key={item.id} item={item} onLongPress={setSheetItemId} />
      ))}
    </div>
  )

  return (
    <div className="isolate flex min-h-dvh flex-col">
      <AppBar right="home" className="hidden lg:flex" />

      {/* mobile: sticky translucent totals bar */}
      <header className="material-bar sticky top-0 z-10 lg:hidden">
        <div className="mx-auto flex max-w-md items-center gap-1 overflow-x-auto px-2 py-2">
          <button
            type="button"
            onClick={() => setStep('home')}
            aria-label="Back to home"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint"
          >
            <House size={20} />
          </button>
          <RunningTotals split={split} layout="chips" />
        </div>
        <div className="scroll-edge absolute inset-x-0 top-full" />
      </header>

      <TwoPane
        mainClassName="flex-1 pb-44 lg:pb-10"
        main={
          <>
            <div className="flex items-center gap-1.5 px-4 py-2 lg:px-0">
              <p className="banner-enter min-w-0 flex-1 py-1 text-xs leading-relaxed text-ink-faint">
                {instruction}
              </p>
              <Button size="sm" className="shrink-0" onClick={() => setChatOpen(true)}>
                <MessageCircle size={14} />
                Chat
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0"
                aria-label="How assigning works"
                onClick={() => setHelpOpen(true)}
              >
                <CircleHelp size={16} />
              </Button>
            </div>
            {receipt}
          </>
        }
        aside={
          <>
            <section className="rounded-lg border border-rule bg-paper-raised p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Assigning to
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <PeopleBrush onManage={() => setPeopleOpen(true)} />
              </div>
            </section>
            <section className="rounded-lg border border-rule bg-paper-raised p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Running totals
              </h2>
              <RunningTotals split={split} layout="list" />
            </section>
            <section className="rounded-lg border border-rule bg-paper-raised p-4">
              <ContinueBar unassigned={unassigned} />
            </section>
          </>
        }
      />

      {/* mobile: bottom tray — the brush in thumb reach */}
      <footer className="material-bar fixed inset-x-0 bottom-0 z-20 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden">
        <div className="scroll-edge absolute inset-x-0 bottom-full rotate-180" />
        <div className="mx-auto max-w-md px-3 pt-2">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <PeopleBrush onManage={() => setPeopleOpen(true)} />
          </div>
          <div className="pt-1">
            <ContinueBar unassigned={unassigned} />
          </div>
        </div>
      </footer>

      <AssignChat open={chatOpen} onOpenChange={setChatOpen} />
      <PeopleSheet open={peopleOpen} onClose={() => setPeopleOpen(false)} />
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
      {sheetItemId !== null && (
        <ExactSplitSheet itemId={sheetItemId} onClose={() => setSheetItemId(null)} />
      )}
    </div>
  )
}
