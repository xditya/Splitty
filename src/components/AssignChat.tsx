// Chat-to-assign sheet: describe who ate what in plain language, review the
// proposed share map, confirm to apply. Nothing touches the bill until the
// user confirms — the proposal card is the approval step.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Drawer } from 'vaul'
import { toast } from 'sonner'
import { useBill } from '../store/bill'
import { chatAssign } from '../scan/assignChat'
import type { AssignProposal } from '../scan/assignContract'
import { unitsLabel } from '../lib/units'
import { initials } from '../lib/palette'
import { Button } from './Button'
import { Send } from './icons'

export function AssignChat({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { bill, applyShares } = useBill()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ proposals: AssignProposal[]; note: string | null } | null>(null)

  const send = async () => {
    const text = message.trim()
    if (!text || busy) return
    setBusy(true)
    setResult(null)
    try {
      const r = await chatAssign(text, bill)
      if (r.proposals.length === 0) {
        toast(r.note ?? "Couldn't match that to any items — try naming them like on the bill.")
      } else {
        setResult(r)
      }
    } catch (e) {
      console.error('[splitty] chat assign failed:', e)
      const reason = e instanceof Error ? e.message : ''
      if (reason === 'no-backend') {
        toast.error('Chat needs an AI: add your free Gemini key in Settings.', {
          duration: 10000,
          action: { label: 'Settings', onClick: () => navigate('/settings') },
        })
      } else if (reason === 'busy') {
        toast.error('Free AI is busy right now — try again in a minute, or assign by tapping.')
      } else {
        toast.error(`Chat failed (${reason || 'unknown'}) — assign by tapping instead.`)
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
    setResult(null)
    onOpenChange(false)
  }

  const personName = (id: string) => bill.people.find((p) => p.id === id)

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) setResult(null)
        onOpenChange(o)
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-30 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 rounded-t-xl bg-paper-raised p-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-rule" />
          <Drawer.Title className="font-warm text-lg">Assign by chat</Drawer.Title>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            Say who had what — "Asha ate the biryani, Ben and Chitra shared the naan, everyone
            split the fries". Nothing changes until you confirm.
          </p>

          <div className="mt-3 flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Who ate what?"
              maxLength={600}
              autoFocus
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-rule bg-paper px-3 text-sm"
            />
            <Button variant="primary" size="icon" aria-label="Send" disabled={busy || !message.trim()} onClick={send}>
              <Send size={18} />
            </Button>
          </div>

          {busy && <p className="mt-3 text-xs text-ink-faint">Working out the split…</p>}

          {result && (
            <div className="banner-enter mt-3">
              <div className="divide-y divide-rule rounded-lg border border-rule">
                {result.proposals.map((p) => (
                  <div key={p.itemId} className="flex items-center gap-2 px-3 py-2">
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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
