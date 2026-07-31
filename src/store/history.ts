// Device-local history of completed splits. Each entry stores a full snapshot
// of the computed split, so it stays viewable even after the 30-day server
// code expires (or when there never was a code). Nothing here leaves the
// device — same privacy posture as the bill store.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SharedSplit } from '../share/codec'

const CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // server-side share expiry
const MAX_ENTRIES = 15

export interface HistoryEntry {
  billId: string
  createdAt: number
  code: string | null
  data: SharedSplit
}

/** Is the server-side code still expected to resolve? */
export function codeAlive(e: HistoryEntry): boolean {
  return !!e.code && Date.now() - e.createdAt < CODE_TTL_MS
}

export function daysLeft(e: HistoryEntry): number {
  return Math.max(0, Math.ceil((e.createdAt + CODE_TTL_MS - Date.now()) / (24 * 60 * 60 * 1000)))
}

interface HistoryState {
  entries: HistoryEntry[]
  upsert: (billId: string, data: SharedSplit, code: string | null) => void
  remove: (billId: string) => void
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      upsert: (billId, data, code) =>
        set((s) => {
          const existing = s.entries.find((e) => e.billId === billId)
          const entry: HistoryEntry = {
            billId,
            createdAt: existing?.createdAt ?? Date.now(),
            code: code ?? existing?.code ?? null,
            data,
          }
          return {
            entries: [entry, ...s.entries.filter((e) => e.billId !== billId)].slice(0, MAX_ENTRIES),
          }
        }),
      remove: (billId) => set((s) => ({ entries: s.entries.filter((e) => e.billId !== billId) })),
    }),
    { name: 'splitty:history' },
  ),
)
