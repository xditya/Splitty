// PWA install plumbing, per platform:
// - Chrome/Edge (Android + desktop): capture `beforeinstallprompt`, re-fire it
//   from our own UI.
// - iOS Safari: no install API exists — we open a short "Add to Home Screen"
//   instruction sheet instead.
// - Already installed (standalone): never show anything.
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null

export const INSTALLABLE_EVENT = 'splitty:installable'
export const IOS_INSTRUCTIONS_EVENT = 'splitty:ios-install'

/** Call once, before render, so the browser's own mini-infobar is suppressed. */
export function initPwaInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    window.dispatchEvent(new Event(INSTALLABLE_EVENT))
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    window.dispatchEvent(new Event(INSTALLABLE_EVENT))
  })
}

export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)

export const isIos = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** Is there any install path worth offering on this device right now? */
export const canInstall = (): boolean => !isStandalone() && (deferred !== null || isIos())

export async function requestInstall(): Promise<'accepted' | 'dismissed' | 'ios-instructions' | 'unavailable'> {
  if (deferred) {
    const d = deferred
    await d.prompt()
    const { outcome } = await d.userChoice
    if (outcome === 'accepted') deferred = null
    return outcome
  }
  if (isIos() && !isStandalone()) {
    window.dispatchEvent(new Event(IOS_INSTRUCTIONS_EVENT))
    return 'ios-instructions'
  }
  return 'unavailable'
}

/** Reactive installability — flips when beforeinstallprompt fires. */
export function useInstallable(): boolean {
  const [v, setV] = useState(false)
  useEffect(() => {
    setV(canInstall())
    const on = () => setV(canInstall())
    window.addEventListener(INSTALLABLE_EVENT, on)
    return () => window.removeEventListener(INSTALLABLE_EVENT, on)
  }, [])
  return v
}
