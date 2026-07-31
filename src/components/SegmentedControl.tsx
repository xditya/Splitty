// PLAN.md §8 — charges segmented control, built with the duplicated-list +
// animated clip-path technique (emil-design-eng "tabs") so the active-segment
// colour transition is one seamless move, not two crossfading states.
import { useRef } from 'react'

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  const n = options.length
  const ref = useRef<HTMLDivElement>(null)
  const left = (idx / n) * 100
  const right = 100 - ((idx + 1) / n) * 100

  const row = (activeLayer: boolean) => (
    <div className={`grid w-full ${activeLayer ? 'pointer-events-none' : ''}`} style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          tabIndex={activeLayer ? -1 : 0}
          aria-hidden={activeLayer}
          aria-pressed={!activeLayer && o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-9 min-w-0 truncate px-2 text-[11px] font-semibold uppercase tracking-wide ${
            activeLayer ? 'text-paper' : 'text-ink-faint'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )

  return (
    <div ref={ref} className="relative overflow-hidden rounded-md border border-rule bg-paper-raised">
      {row(false)}
      {/* Active copy, clipped to the selected segment; the clip is what animates. */}
      <div
        className="absolute inset-0 bg-ink transition-[clip-path] duration-200"
        style={{
          clipPath: `inset(0 ${right}% 0 ${left}% round 4px)`,
          transitionTimingFunction: 'var(--ease-in-out)',
        }}
      >
        {row(true)}
      </div>
    </div>
  )
}
