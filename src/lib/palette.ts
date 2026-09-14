// PLAN.md §15.1 — 8 fixed person colours, assigned by index, high-contrast,
// legible as 24px chips. No red/green pair: paid/pending owns those.
export const PALETTE = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#0d9488', // teal
  '#ea580c', // orange
  '#4338ca', // indigo
  '#92400e', // brown
  '#475569', // slate
] as const

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length]
}

/** How the UI addresses someone: the first word of their name. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
