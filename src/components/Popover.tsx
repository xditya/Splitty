// Minimal accessible popover. Scales in from its trigger (§15.5 — origin-aware,
// never center), 150ms ease-out, esc/outside-click dismiss.
// Hand-rolled note: base-ui is the §2 pick; this stands in with the same
// behavioural contract to keep the dependency surface small for v1.
import { useEffect, useId, useRef, useState } from 'react'
import { Info } from './icons'

export function Popover({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label="More information"
        onClick={() => setOpen((v) => !v)}
        className="pressable relative inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-faint after:absolute after:-inset-2 after:content-['']"
      >
        <Info size={16} />
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          className="popover-panel absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-md border border-rule bg-paper-raised p-3 text-xs leading-relaxed shadow-lg"
          style={{ transformOrigin: 'top center' }}
        >
          {children}
        </div>
      )}
      <style>{`
        .popover-panel { opacity: 1; scale: 1; transition: opacity 150ms var(--ease-out), scale 150ms var(--ease-out); }
        @starting-style { .popover-panel { opacity: 0; scale: 0.95; } }
        @media (prefers-reduced-motion: reduce) { .popover-panel { scale: 1 !important; } }
      `}</style>
    </span>
  )
}
