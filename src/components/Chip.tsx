// PLAN.md §8 — avatar chips. Active = full colour, inactive = dimmed.
// State flips are instant (§15.2 frequency rule) — colour/opacity only, no motion.
import { clsx } from 'clsx'
import { initials } from '../lib/palette'
import type { Person } from '../lib/types'

// xs stacks inside item summaries, card sits on the assign header cards.
const DIMS = {
  xs: 'h-[18px] w-[18px] text-[8px]',
  sm: 'h-6 w-6 text-[10px]',
  card: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
}

export function PersonChip({
  person,
  active = true,
  size = 'md',
  onClick,
  label,
  className,
}: {
  person: Person
  active?: boolean
  size?: keyof typeof DIMS
  onClick?: () => void
  label?: React.ReactNode
  className?: string
}) {
  const avatar = (
    <span
      className={clsx(
        DIMS[size],
        'flex items-center justify-center rounded-full font-bold text-white select-none',
        !active && 'opacity-40',
        className,
      )}
      style={{ background: person.color }}
    >
      {initials(person.name)}
    </span>
  )
  if (!onClick) return avatar
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="pressable flex min-w-11 min-h-11 flex-col items-center gap-0.5 px-1"
    >
      {avatar}
      {label}
    </button>
  )
}
