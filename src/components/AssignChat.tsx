// Chat-to-assign, as a FULL-SCREEN overlay (not a bottom drawer): iOS Safari's
// keyboard + fixed-drawer + viewport-unit interactions repeatedly broke the
// sheet version. Full-screen with the composer at the TOP is quirk-free — the
// keyboard rises from the bottom and can never cover the input or the results
// that render directly beneath it. Nothing touches the bill until Apply.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useBill } from '../store/bill'
import { getUserKey } from '../store/settings'
import { chatAssign } from '../scan/assignChat'
import type { AssignProposal } from '../scan/assignContract'
import { unitsLabel } from '../lib/units'
import { initials } from '../lib/palette'
import { Button } from './Button'
import { Send, X } from './icons'

export function AssignChat({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { bill, applyShares } = useBill()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ proposals: AssignProposal[]; note: string | null } | null>(null)
  const hasKey = !!getUserKey()

  const close = () => {
    setResult(null)
    setError(null)
    onOpenChange(false)
  }

  const send = async () => {
    const text = message.trim()
    if (!text || busy) return
    setBusy(true)
    setResult(null)
    setError(null)
    // drop the keyboard so the outcome area below gets the screen back
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    try {
      const r = await chatAssign(text, bill)
      if (r.proposals.length === 0) {
        setError(r.note ?? "Couldn't match that to any items — try naming them like on the bill.")
      } else {
        setResult(r)
      }
    } catch (e) {
      console.error('[splitty] chat assign failed:', e)
      const reason = e instanceof Error ? e.message : ''
      if (reason === 'no-backend') {
        setError('No AI available here: this preview has no server, so chat needs your own Gemini key.')
      } else if (reason === 'busy') {
        setError('The free AI is busy right now — try again in a minute, or assign by tapping.')
      } else {
        setError(`Chat failed (${reason || 'unknown'}) — assign by tapping instead.`)
      }
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!result) return
    // one undoable step, not one per item
    applyShares(Object.fromEntries(result.proposals.map((p) => [p.itemId, p.shares])))
    toast(`Assigned ${result.proposals.length} item${result.proposals.length === 1 ? '' : 's'} — check the badges.`)
    setMessage('')
    close()
  }

  const personName = (id: string) => bill.people.find((p) => p.id === id)

  if (!open) return null

  return createPortal(
    <div className="chat-overlay fixed inset-0 z-40 isolate bg-paper" role="dialog" aria-label="Assign by chat">
      <div className="mx-auto flex h-full max-w-md flex-col px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 className="font-warm text-xl">Assign by chat</h2>
          <Button size="icon" variant="ghost" aria-label="Close chat" onClick={close}>
            <X size={20} />
          </Button>
        </div>
        <p className="mt-1 shrink-0 text-xs leading-relaxed text-ink-faint">
          Say who had what — "Asha ate the biryani, Ben and Chitra shared the naan, everyone split
          the fries". Nothing changes until you confirm.
        </p>

        {/* composer at the TOP: the phone keyboard can never cover it */}
        <div className="mt-3 flex shrink-0 gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Who ate what?"
            maxLength={600}
            autoFocus
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-rule bg-paper-raised px-3 text-sm"
          />
          <Button variant="primary" size="icon" aria-label="Send" disabled={busy || !message.trim()} onClick={send}>
            <Send size={18} />
          </Button>
        </div>

        {/* outcome directly under the composer; full-height container makes
            this flex area well-defined in every engine */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-4">
          {!hasKey && !busy && !result && !error && (
            <button
              type="button"
              onClick={() => {
                close()
                navigate('/settings')
              }}
              className="pressable w-full rounded-lg border border-amber-flag/40 bg-amber-50 px-3 py-2 text-left text-xs leading-relaxed text-amber-flag"
            >
              No Gemini key on this device — chat here relies on the free server tier when
              available. <span className="font-semibold underline">Add your key in Settings</span>
            </button>
          )}

          {busy && <p className="text-xs text-ink-faint">Working out the split…</p>}

          {error && (
            <p className="banner-enter rounded-lg border border-settle-pending/40 bg-red-50 px-3 py-2 text-xs leading-relaxed text-settle-pending">
              {error}
            </p>
          )}

          {result && (
            <div className="banner-enter">
              <div className="divide-y divide-rule rounded-lg border border-rule bg-paper-raised">
                {result.proposals.map((p) => (
                  <div key={p.itemId} className="flex items-center gap-2 px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{p.itemName}</span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {Object.entries(p.shares).map(([pid, n]) => {
                        const person = personName(pid)
                        if (!person) return null
                        return (
                          <span
                            key={pid}
                            className="flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-bold text-white"
                            style={{ background: person.color }}
                          >
                            {initials(person.name)}
                            {unitsLabel(n) && <span className="opacity-90">{unitsLabel(n)}</span>}
                          </span>
                        )
                      })}
                    </span>
                  </div>
                ))}
              </div>
              {result.note && <p className="mt-2 text-xs text-amber-flag">{result.note}</p>}
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" onClick={() => setResult(null)}>
                  Try again
                </Button>
                <Button variant="primary" className="flex-1" onClick={apply}>
                  Apply to the bill
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .chat-overlay { opacity: 1; transition: opacity 150ms var(--ease-out); }
        @starting-style { .chat-overlay { opacity: 0; } }
      `}</style>
    </div>,
    document.body,
  )
}
