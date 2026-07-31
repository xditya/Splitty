// PLAN.md §1 — scan → assign → settle. Manual entry is a first-class path;
// there is no state where the app shows an error and stops.
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useBill } from '../store/bill'
import { getUserKey, useSettings } from '../store/settings'
import { scanBill, type ScanStatus } from '../scan/router'
import { Popover } from '../components/Popover'
import { SegmentedControl } from '../components/SegmentedControl'

export function HomeScreen() {
  const { newBill, loadScan, bill, setStep } = useBill()
  const { tesseractBannerDismissed, dismissTesseractBanner, alwaysOnDevice, setAlwaysOnDevice } =
    useSettings()
  const hasUserKey = !!getUserKey()
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const billInProgress = bill.items.length > 0 || bill.people.length > 0

  const onFile = async (f: File | null) => {
    if (!f) return
    newBill()
    setStep('home')
    try {
      const result = await scanBill(f, setStatus)
      loadScan(result) // navigates to people/items
      if (result.engine === 'tesseract' && !tesseractBannerDismissed) {
        // §4.3 — dismissible banner after a tier-3 result
        toast('Scanned on your device. Add your own free Gemini key in Settings for better accuracy.', {
          action: { label: 'Dismiss', onClick: dismissTesseractBanner },
          duration: 8000,
        })
      }
    } catch (e) {
      // §1 principle 1 — never broken: OCR died entirely, manual entry still works
      console.error('[splitty] scan failed:', e)
      toast('Could not read the photo — enter the bill manually.', { duration: 8000 })
      setStep('people')
    } finally {
      setStatus(null)
    }
  }

  const statusLine = (s: ScanStatus): string => {
    if (s.phase === 'preprocess') return 'Preparing photo…'
    if (s.phase === 'flood-wait') return `Busy — retrying in ${s.secondsLeft}s` // §4.3 live countdown
    if (s.engine !== 'tesseract') return 'Reading the bill…'
    // tesseract stages, humanised
    if (s.step?.includes('recognizing')) return 'Reading text on this device…'
    if (s.step?.includes('language') || s.step?.includes('loading tesseract')) {
      return 'Downloading the OCR model (one-time, ~2 MB)…'
    }
    return 'Reading on this device…'
  }

  const scanProgress =
    status?.phase === 'scanning' && status.engine === 'tesseract' && status.progress != null
      ? status.progress
      : null

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <header className="mt-6">
        <h1 className="font-warm text-5xl tracking-tight">Splitty</h1>
        <p className="mt-2 text-sm text-ink-faint">
          Scan the bill. Tap who had what. Everyone pays their share over UPI.
        </p>
      </header>

      <main className="mt-10 flex flex-col gap-3">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {/* no `capture` → opens the gallery / file picker instead of the camera */}
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={status !== null}
          onClick={() => cameraRef.current?.click()}
          className="pressable rounded-lg bg-ink py-4 text-base font-bold text-paper disabled:opacity-60"
        >
          📷 Scan a bill
        </button>
        <button
          type="button"
          disabled={status !== null}
          onClick={() => uploadRef.current?.click()}
          className="pressable rounded-lg border border-rule bg-paper-raised py-4 text-base font-bold disabled:opacity-60"
        >
          🖼️ Upload a bill photo
        </button>
        {/* Scan engine, visible and switchable on the main UI (§14 — the
            on-device promise is only credible if the choice is in reach) */}
        <div className="rounded-md border border-rule bg-paper-raised p-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              Scan with
            </span>
            <div className="flex-1">
              <SegmentedControl
                options={[
                  { value: 'gemini', label: 'Gemini AI' },
                  { value: 'device', label: 'On-device' },
                ]}
                value={alwaysOnDevice ? 'device' : 'gemini'}
                onChange={(v) => setAlwaysOnDevice(v === 'device')}
              />
            </div>
            {!alwaysOnDevice && (
              <Link
                to="/settings"
                aria-label="Gemini settings"
                className="pressable flex h-11 w-11 items-center justify-center rounded-md border border-rule text-base"
              >
                ⚙️
              </Link>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-ink-faint">
            {alwaysOnDevice ? (
              <span>Photos never leave this phone. Slightly less accurate.</span>
            ) : (
              <>
                <span>
                  {hasUserKey
                    ? 'Using your API key — photos go straight to Google.'
                    : 'Free tier — falls back to on-device when busy.'}
                </span>
                {/* §14 — honest privacy, shown for the Gemini tiers */}
                <Popover>
                  Google's free tier may use submitted images to improve their models. Receipts can
                  contain names and card digits. To keep everything on your device, switch to
                  on-device scanning.
                </Popover>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => newBill()}
          className="pressable rounded-lg border border-rule bg-paper-raised py-4 text-base font-bold"
        >
          ✏️ Enter manually
        </button>

        {billInProgress && (
          <button
            type="button"
            onClick={() => setStep(bill.items.length > 0 ? 'assign' : 'people')}
            className="pressable banner-enter rounded-lg border border-dashed border-rule py-3 text-sm text-ink-faint"
          >
            Resume the bill in progress →
          </button>
        )}
      </main>

      {/* Scanning overlay — the app must never look dead mid-scan (§1). */}
      {status && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6" role="status" aria-live="polite">
          <div className="banner-enter w-full max-w-xs rounded-lg bg-paper-raised p-5 text-center shadow-xl">
            <div className="scan-spinner mx-auto" aria-hidden />
            <p className="mt-4 text-sm font-bold">{statusLine(status)}</p>
            {scanProgress !== null && (
              <div className="scan-progress mt-3">
                <div style={{ transform: `scaleX(${Math.min(1, scanProgress)})` }} />
              </div>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              {status.phase === 'flood-wait'
                ? 'Free scans are busy — auto-retrying, or it falls back to on-device reading.'
                : 'You can enter the bill manually any time if this drags on.'}
            </p>
          </div>
        </div>
      )}

      <footer className="mt-auto flex justify-between pt-10 text-sm">
        <Link to="/join" className="pressable px-2 py-2 underline">
          Join a split
        </Link>
        <Link to="/settings" className="pressable px-2 py-2 underline">
          Settings
        </Link>
      </footer>
    </div>
  )
}
