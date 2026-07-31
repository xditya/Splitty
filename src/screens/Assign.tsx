// PLAN.md §8 — the assignment screen. One hand, standing, noisy restaurant.
// The people selector lives in a BOTTOM TRAY (thumb reach): select one person
// for the solo fast path, or several to "club" them — one tap then assigns a
// share to everyone selected (A+B on the fries, A+C on the wings, A alone on
// the lassi). Tap-to-assign itself has NO animation (§15.2 frequency rule):
// the badge appears instantly and the totals ticking (NumberFlow) is the
// feedback.
import { useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { animate } from 'motion/react'
import { useBill } from '../store/bill'
import { computeSplit } from '../lib/split'
import { PersonChip } from '../components/Chip'
import { Money, MoneyStatic } from '../components/Money'
import { initials } from '../lib/palette'
import { fullyAssigned, unitsLabel, unitsUsed } from '../lib/units'
import type { Item } from '../lib/types'
import { clsx } from 'clsx'

/**
 * §15.4 gesture spec: pointer capture, grab offset respected, 10px hysteresis,
 * 1:1 tracking, velocity (>0.11 px/ms) OR distance dismissal, rubber-band the
 * wrong way, spring back carrying release velocity, extra pointers ignored.
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
    if (ref.current) ref.current.style.transform = `translateX(${x}px)` // direct, not a CSS var (§15.3 perf)
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

    if (dx < -72 || velocity < -0.11) onClear() // flick counts (§15.4)

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

// Rejection feedback (apple-design §13 — reserve haptics for meaningful
// moments): a short buzz + row shake ONLY when a tap is blocked. Successful
// assigns stay silent — they happen 50–150× per bill (§15.2 frequency rule).
const buzz = () => navigator.vibrate?.(35)

function AssignRow({ item, onLongPress }: { item: Item; onLongPress: (id: string) => void }) {
  const { bill, tapAssign, clearShares, updateItem } = useBill()
  const [rejecting, setRejecting] = useState(false)

  // Remove one unit (or their fractional club share) from one person.
  const decrement = (personId: string) => {
    const shares = { ...item.shares }
    const cur = shares[personId] ?? 0
    if (cur > 1.01) shares[personId] = cur - 1
    else delete shares[personId]
    updateItem(item.id, { shares })
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
    <div className="relative overflow-hidden">
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
          'pressable-row relative flex min-h-[52px] cursor-pointer touch-pan-y items-center gap-2 border-b border-dashed border-rule bg-paper-raised px-3 py-2 select-none',
          incomplete && 'border-l-4 border-l-amber-flag', // §8 guardrail
          item.confidence === 'low' && 'bg-amber-50',
          rejecting && 'row-reject',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">
            {item.qty > 1 && <span className="text-ink-faint">{item.qty}× </span>}
            {item.name || 'Unnamed item'}
            {item.qty > 1 && (
              <span className={clsx('ml-1 text-[10px]', incomplete ? 'text-amber-flag' : 'text-ink-faint')}>
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
                    aria-label={`Remove one ${p.name} share of ${item.name}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      decrement(pid)
                    }}
                    className="pressable relative flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-bold text-white after:absolute after:-inset-2 after:content-['']"
                    style={{ background: p.color }}
                  >
                    {initials(p.name)}
                    {unitsLabel(n) && <span className="opacity-90">{unitsLabel(n)}</span>}
                    <span aria-hidden className="ml-0.5 opacity-70">✕</span>
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

export function AssignScreen() {
  const {
    bill,
    activePersonIds,
    togglePerson,
    selectAll,
    clearSelection,
    selectOnly,
    addPerson,
    setStep,
    splitEvenly,
  } = useBill()
  const [sheetItemId, setSheetItemId] = useState<string | null>(null)
  const [sheetSelection, setSheetSelection] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')

  // Someone joined the table mid-assignment: add them, brush switches to them.
  const submitNewPerson = () => {
    const name = newName.trim()
    if (!name) return
    addPerson(name)
    const people = useBill.getState().bill.people
    selectOnly(people[people.length - 1].id)
    setNewName('')
    setAddOpen(false)
  }
  const split = computeSplit(bill)
  // §8 guardrail — an item blocks Continue until EVERY unit is claimed
  const unassigned = bill.items.filter((i) => !fullyAssigned(i.shares, i.qty)).length
  const sheetItem = bill.items.find((i) => i.id === sheetItemId)
  const allSelected = activePersonIds.length === bill.people.length && bill.people.length > 0
  const selectedNames = bill.people
    .filter((p) => activePersonIds.includes(p.id))
    .map((p) => p.name.split(/\s+/)[0])

  return (
    <div className="flex min-h-dvh flex-col">
      {/* §15.1 — running totals live in a translucent top material. Selection
          state mirrors the tray; tapping here toggles too. */}
      <header className="material-bar sticky top-0 z-20">
        <div className="mx-auto flex max-w-md items-center gap-1 overflow-x-auto px-2 py-2">
          {/* escape hatch — the bill persists, Home offers "Resume" */}
          <button
            type="button"
            onClick={() => setStep('home')}
            aria-label="Back to home"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-rule text-base"
          >
            🏠
          </button>
          {bill.people.map((p) => (
            <PersonChip
              key={p.id}
              person={p}
              active={activePersonIds.length === 0 || activePersonIds.includes(p.id)}
              onClick={() => togglePerson(p.id)}
              label={
                <Money paise={split.perPerson[p.id]?.total ?? 0} className="text-[10px] text-ink-faint" />
              }
            />
          ))}
        </div>
        <div className="scroll-edge absolute inset-x-0 top-full" />
      </header>

      <main className="mx-auto w-full max-w-md flex-1 pb-44">
        <p className="banner-enter px-4 py-3 text-xs text-ink-faint">
          {activePersonIds.length === 0 ? (
            <>
              Pick people below, then tap items — each tap assigns one unit. Pick two+ and they
              share a unit together (½ each).
            </>
          ) : activePersonIds.length === 1 ? (
            <>
              Each tap: <span className="font-bold text-ink">{selectedNames[0]}</span> takes one
              unit. Badge ✕ removes; swipe left clears.
            </>
          ) : (
            <>
              Each tap: <span className="font-bold text-ink">{selectedNames.join(' + ')}</span>{' '}
              share one unit together. Badge ✕ removes; swipe left clears.
            </>
          )}
        </p>
        <div className="torn-edge mx-3 mt-1 bg-paper-raised pb-3 shadow-sm">
          {bill.items.map((item) => (
            <AssignRow
              key={item.id}
              item={item}
              onLongPress={(id) => {
                setSheetItemId(id)
                setSheetSelection(Object.keys(bill.items.find((i) => i.id === id)?.shares ?? {}))
              }}
            />
          ))}
        </div>
      </main>

      {/* §8 — bottom tray: the assignment brush, in thumb reach */}
      <footer className="material-bar fixed inset-x-0 bottom-0 z-20 pb-[max(10px,env(safe-area-inset-bottom))]">
        <div className="scroll-edge absolute inset-x-0 bottom-full rotate-180" />
        <div className="mx-auto max-w-md px-3 pt-2">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {bill.people.map((p) => {
              const on = activePersonIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePerson(p.id)}
                  className={clsx(
                    'pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold',
                    on ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-faint',
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
                'pressable min-h-11 shrink-0 rounded-full border px-3 text-xs font-bold',
                allSelected ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-faint',
              )}
            >
              Everyone
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="pressable min-h-11 shrink-0 rounded-full border border-dashed border-rule px-3 text-xs font-bold text-ink-faint"
            >
              + Add
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-xs">
              {unassigned > 0 ? (
                <span className="font-bold text-amber-flag">
                  {unassigned} item{unassigned === 1 ? '' : 's'} not fully assigned
                </span>
              ) : (
                <span className="text-ink-faint">All items assigned</span>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep('items')} className="pressable rounded-md border border-rule px-4 py-2 text-sm">
                Back
              </button>
              <button
                type="button"
                disabled={unassigned > 0 || bill.items.length === 0}
                onClick={() => setStep('charges')}
                className="pressable rounded-md bg-ink px-5 py-2 text-sm font-bold text-paper disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Add a late joiner without leaving the assignment flow */}
      <Drawer.Root open={addOpen} onOpenChange={setAddOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-30 bg-black/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 rounded-t-xl bg-paper-raised p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-rule" />
            <Drawer.Title className="font-warm text-lg">Add a person</Drawer.Title>
            <div className="mt-3 flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitNewPerson()}
                placeholder="Name"
                autoFocus
                className="min-h-11 min-w-0 flex-1 rounded-md border border-rule bg-paper px-3 text-sm"
              />
              <button
                type="button"
                disabled={!newName.trim()}
                onClick={submitNewPerson}
                className="pressable min-h-11 rounded-md bg-ink px-4 text-sm font-bold text-paper disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* §8 secondary action — Vaul sheet for exact per-item membership */}
      <Drawer.Root open={sheetItemId !== null} onOpenChange={(o) => !o && setSheetItemId(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-30 bg-black/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 rounded-t-xl bg-paper-raised p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-rule" />
            <Drawer.Title className="font-warm text-lg">
              Split “{sheetItem?.name || 'item'}” evenly among…
            </Drawer.Title>
            <p className="mt-1 text-xs text-ink-faint">
              Splits {sheetItem && sheetItem.qty > 1 ? `all ${sheetItem.qty} units` : 'the whole item'}{' '}
              evenly among whoever you pick.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {bill.people.map((p) => {
                const on = sheetSelection.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setSheetSelection((sel) => (on ? sel.filter((x) => x !== p.id) : [...sel, p.id]))
                    }
                    className={clsx(
                      'pressable flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm',
                      on ? 'border-ink bg-ink text-paper' : 'border-rule',
                    )}
                  >
                    <PersonChip person={p} size="sm" />
                    {p.name}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              disabled={sheetSelection.length === 0}
              onClick={() => {
                if (sheetItemId) splitEvenly(sheetItemId, sheetSelection)
                setSheetItemId(null)
              }}
              className="pressable mt-5 w-full rounded-md bg-ink py-3 text-sm font-bold text-paper disabled:opacity-40"
            >
              Split {sheetSelection.length > 0 ? `${sheetSelection.length} ways` : ''}
            </button>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}
