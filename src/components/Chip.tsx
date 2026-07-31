// PLAN.md §8 — avatar chips. Active = full colour, inactive = dimmed.
// State flips are instant (§15.2 frequency rule) — colour/opacity only, no motion.
import { clsx } from 'clsx'
import { initials } from '../lib/palette'
import type { Person } from '../lib/types'

export function PersonChip({
  person,
  active = true,
  size = 'md',
  onClick,
  label,
}: {
  person: Person
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  label?: React.ReactNode
}) {
  const dims = { sm: 'h-6 w-6 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm' }[size]
  const avatar = (
    <span
      className={clsx(
        dims,
        'flex items-center justify-center rounded-full font-bold text-white select-none',
        !active && 'opacity-40',
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
