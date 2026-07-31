// PLAN.md §1 — scan → assign → settle. Manual entry is a first-class path;
// there is no state where the app shows an error and stops.
// Hierarchy (craft R4): ONE hero action — Scan. Everything else is quieter.
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useBill } from "../store/bill";
import { getUserKey, useSettings } from "../store/settings";
import { scanBill, type ScanStatus } from "../scan/router";
import { Popover } from "../components/Popover";
import { SegmentedControl } from "../components/SegmentedControl";
import { Button } from "../components/Button";
import {
  Camera,
  Download,
  ImageUp,
  PencilLine,
  QrCode,
  Settings,
  Undo2,
} from "../components/icons";
import { GithubIcon } from "../components/GithubIcon";
import { requestInstall, useInstallable } from "../lib/pwa";

export function HomeScreen() {
  const { newBill, loadScan, bill, setStep } = useBill();
  const {
    tesseractBannerDismissed,
    dismissTesseractBanner,
    alwaysOnDevice,
    setAlwaysOnDevice,
  } = useSettings();
  const hasUserKey = !!getUserKey();
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const billInProgress = bill.items.length > 0 || bill.people.length > 0;
  const installable = useInstallable(); // quiet landing-page affordance only

  const onFile = async (f: File | null) => {
    if (!f) return;
    newBill();
    setStep("home");
    try {
      const result = await scanBill(f, setStatus);
      loadScan(result); // navigates to people/items
      if (result.engine === "tesseract" && !tesseractBannerDismissed) {
        // §4.3 — dismissible banner after a tier-3 result
        toast(
          "Scanned on your device. Add your own free Gemini key in Settings for better accuracy.",
          {
            action: { label: "Dismiss", onClick: dismissTesseractBanner },
            duration: 8000,
          },
        );
      }
    } catch (e) {
      // §1 principle 1 — never broken: OCR died entirely, manual entry still works
      console.error("[splitty] scan failed:", e);
      toast("Could not read the photo — enter the bill manually.", {
        duration: 8000,
      });
      setStep("people");
    } finally {
      setStatus(null);
    }
  };

  const statusLine = (s: ScanStatus): string => {
    if (s.phase === "preprocess") return "Preparing photo…";
    if (s.phase === "flood-wait") return `Busy — retrying in ${s.secondsLeft}s`; // §4.3 live countdown
    if (s.engine !== "tesseract") return "Reading the bill…";
    if (s.step?.includes("recognizing")) return "Reading text on this device…";
    if (s.step?.includes("language") || s.step?.includes("loading tesseract")) {
      return "Downloading the OCR model (one-time, ~2 MB)…";
    }
    return "Reading on this device…";
  };

  const scanProgress =
    status?.phase === "scanning" &&
    status.engine === "tesseract" &&
    status.progress != null
      ? status.progress
      : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-4">
      <div className="flex justify-end">
        <Link
          to="/settings"
          aria-label="Settings"
          className="pressable flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint hover:bg-ink/5 hover:text-ink"
        >
          <Settings size={20} />
        </Link>
      </div>

      <header className="mt-8">
        <h1 className="font-warm text-5xl tracking-tight">Splitty</h1>
        <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-ink-faint">
          Scan the bill. Tap who had what. Everyone pays their share over UPI.
        </p>
      </header>

      <main className="mt-10 flex flex-col gap-4">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />

        {/* the one hero action */}
        <Button
          variant="primary"
          size="lg"
          full
          disabled={status !== null}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera size={20} />
          Scan a bill
        </Button>

        {/* quieter alternatives: an option list, not competing slabs */}
        <div className="divide-y divide-rule rounded-lg border border-rule bg-paper-raised">
          <button
            type="button"
            disabled={status !== null}
            onClick={() => uploadRef.current?.click()}
            className="pressable flex min-h-13 w-full items-center gap-3 px-4 text-sm font-semibold hover:bg-paper disabled:opacity-40"
          >
            <ImageUp size={18} className="text-ink-faint" />
            Upload a bill photo
          </button>
          <button
            type="button"
            onClick={() => newBill()}
            className="pressable flex min-h-13 w-full items-center gap-3 px-4 text-sm font-semibold hover:bg-paper"
          >
            <PencilLine size={18} className="text-ink-faint" />
            Enter the bill manually
          </button>
        </div>

        {/* engine choice, compact (§14 — the on-device promise stays in reach) */}
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Scan with
            </span>
            <div className="flex-1">
              <SegmentedControl
                options={[
                  { value: "gemini", label: "Gemini AI" },
                  { value: "device", label: "On-device" },
                ]}
                value={alwaysOnDevice ? "device" : "gemini"}
                onChange={(v) => setAlwaysOnDevice(v === "device")}
              />
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs text-ink-faint">
            {alwaysOnDevice ? (
              <span>
                Photos never leave this phone. Slightly less accurate.
              </span>
            ) : (
              <>
                <span>
                  {hasUserKey
                    ? "Using your API key — photos go straight to Google."
                    : "Free tier — falls back to on-device when busy."}
                </span>
                {/* §14 — honest privacy, shown for the Gemini tiers */}
                <Popover>
                  Google's free tier may use submitted images to improve their
                  models. Receipts can contain names and card digits. To keep
                  everything on your device, switch to on-device scanning.
                </Popover>
              </>
            )}
          </div>
        </div>

        {billInProgress && (
          <Button
            className="banner-enter mt-2 border-dashed"
            onClick={() => setStep(bill.items.length > 0 ? "assign" : "people")}
          >
            <Undo2 size={16} className="text-ink-faint" />
            Resume the bill in progress
          </Button>
        )}
      </main>

      <footer className="mt-auto pt-10">
        <Button variant="ghost" full onClick={() => navigate("/join")}>
          <QrCode size={16} />
          Join a split with a code
        </Button>
        {installable && (
          <Button variant="ghost" full onClick={() => void requestInstall()}>
            <Download size={16} />
            Install Splitty as an app
          </Button>
        )}
        <a
          href="https://github.com/xditya/splitty"
          target="_blank"
          rel="noreferrer"
          className="pressable mx-auto mt-1 flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-ink-faint hover:text-ink"
        >
          <GithubIcon size={14} />
          View on GitHub
        </a>
      </footer>

      {/* Scanning overlay — the app must never look dead mid-scan (§1). */}
      {status && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-6"
          role="status"
          aria-live="polite"
        >
          <div className="banner-enter w-full max-w-xs rounded-xl bg-paper-raised p-5 text-center shadow-xl">
            <div className="scan-spinner mx-auto" aria-hidden />
            <p className="mt-4 text-sm font-semibold">{statusLine(status)}</p>
            {scanProgress !== null && (
              <div className="scan-progress mt-3">
                <div
                  style={{ transform: `scaleX(${Math.min(1, scanProgress)})` }}
                />
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              {status.phase === "flood-wait"
                ? "Free scans are busy — auto-retrying, or it falls back to on-device reading."
                : "You can enter the bill manually any time if this drags on."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
