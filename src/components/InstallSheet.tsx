// iOS has no install API — this sheet shows the manual Add-to-Home-Screen
// steps. Mounted once in App; opened via the IOS_INSTRUCTIONS_EVENT.
import { useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import { IOS_INSTRUCTIONS_EVENT } from '../lib/pwa'
import { Share, SquarePlus } from './icons'
import { Button } from './Button'

export function InstallSheet() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(IOS_INSTRUCTIONS_EVENT, on)
    return () => window.removeEventListener(IOS_INSTRUCTIONS_EVENT, on)
  }, [])

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-30 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-40 rounded-t-xl bg-paper-raised p-6 pb-[max(24px,env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rule" />
          <Drawer.Title className="font-warm text-xl">Add Splitty to your Home Screen</Drawer.Title>
          <ol className="mt-4 space-y-4 text-sm leading-relaxed">
            <li className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rule text-ink-faint">
                <Share size={16} />
              </span>
              <span>
                Tap the <span className="font-semibold">Share</span> button in Safari's toolbar.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rule text-ink-faint">
                <SquarePlus size={16} />
              </span>
              <span>
                Scroll down and choose <span className="font-semibold">Add to Home Screen</span>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rule text-[11px] font-bold text-ink-faint">
                3
              </span>
              <span>
                Tap <span className="font-semibold">Add</span> — Splitty opens full-screen, works
                offline for manual entry, and keeps your bill.
              </span>
            </li>
          </ol>
          <Button full className="mt-6" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
