// PLAN.md §11 (BYOK), §7.5 (per-device charge-mode defaults), §10.1 (VPA in localStorage only).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChargeKind, SplitMode } from '../lib/types'

const KEY_LS = 'splitty:gemini-key'

/** §11 — "Remember on this device" → localStorage vs sessionStorage. */
export function getUserKey(): string | null {
  return localStorage.getItem(KEY_LS) ?? sessionStorage.getItem(KEY_LS)
}
export function setUserKey(key: string, remember: boolean) {
  clearUserKey()
  ;(remember ? localStorage : sessionStorage).setItem(KEY_LS, key)
}
export function clearUserKey() {
  localStorage.removeItem(KEY_LS)
  sessionStorage.removeItem(KEY_LS)
}

interface SettingsState {
  model: string
  availableModels: string[] // from ListModels for the user's key; [] = use MODELS fallback
  alwaysOnDevice: boolean // §14 — the toggle that makes the privacy copy true
  payerVpa: string
  payerName: string
  chargeModeDefaults: Partial<Record<ChargeKind, SplitMode>>
  tesseractBannerDismissed: boolean
  setModel: (m: string) => void
  setAvailableModels: (ids: string[]) => void
  setAlwaysOnDevice: (v: boolean) => void
  setPayerVpa: (v: string) => void
  setPayerName: (v: string) => void
  rememberChargeMode: (kind: ChargeKind, mode: SplitMode) => void
  dismissTesseractBanner: () => void
}

// Fallback list only — Settings fetches the key's real model list (ListModels)
// so retired IDs (e.g. the 2.5 family, closed to new users) can't brick scans.
export const MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'Flash-Lite 3.5 (fastest, most free quota)' },
  { id: 'gemini-3.6-flash', label: 'Flash 3.6 (more accurate)' },
]

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      model: MODELS[0].id,
      availableModels: [],
      alwaysOnDevice: false,
      payerVpa: '',
      payerName: '',
      chargeModeDefaults: {},
      tesseractBannerDismissed: false,
      setModel: (model) => set({ model }),
      setAvailableModels: (availableModels) => set({ availableModels }),
      setAlwaysOnDevice: (alwaysOnDevice) => set({ alwaysOnDevice }),
      setPayerVpa: (payerVpa) => set({ payerVpa }),
      setPayerName: (payerName) => set({ payerName }),
      rememberChargeMode: (kind, mode) =>
        set((s) => ({ chargeModeDefaults: { ...s.chargeModeDefaults, [kind]: mode } })),
      dismissTesseractBanner: () => set({ tesseractBannerDismissed: true }),
    }),
    {
      name: 'splitty:settings',
      version: 1,
      // retire persisted 2.5-family model ids (closed to new users, 404s)
      migrate: (persisted) => {
        const s = persisted as Partial<SettingsState>
        if (s.model?.startsWith('gemini-2.5')) s.model = MODELS[0].id
        return s
      },
    },
  ),
)
