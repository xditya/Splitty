// PLAN.md §11 (BYOK — the conversion funnel) + §14 (privacy copy, literally true).
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  clearUserKey,
  getUserKey,
  MODELS,
  setUserKey,
  useSettings,
} from "../store/settings";
import { validateKey } from "../scan/gemini";
import { Button } from "../components/Button";
import {
  Check,
  ChevronLeft,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  X,
} from "../components/icons";
import { GithubIcon } from "../components/GithubIcon";

export function SettingsScreen() {
  const s = useSettings();
  const [key, setKey] = useState(getUserKey() ?? "");
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(true);
  const [check, setCheck] = useState<"idle" | "checking" | "ok" | "bad">(
    getUserKey() ? "ok" : "idle",
  );

  const onKeyInput = async (value: string) => {
    setKey(value);
    if (value.trim().length < 20) {
      setCheck("idle");
      return;
    }
    // §11 — validate on paste (zero-token ListModels); never discover a bad key mid-scan
    setCheck("checking");
    const { ok, models } = await validateKey(value.trim());
    setCheck(ok ? "ok" : "bad");
    if (ok) {
      setUserKey(value.trim(), remember);
      if (models.length > 0) {
        s.setAvailableModels(models);
        // if the saved model isn't usable by this key, pick the lite tier
        if (!models.includes(s.model)) {
          s.setModel(models.find((m) => m.includes("lite")) ?? models[0]);
        }
      }
    }
  };

  const modelOptions =
    s.availableModels.length > 0
      ? s.availableModels.map((id) => ({ id, label: id }))
      : MODELS;

  return (
    <div className="mx-auto max-w-md px-4 py-6 lg:max-w-lg">
      <Link
        to="/"
        className="pressable flex w-fit items-center gap-1 rounded-lg py-2 pr-3 text-sm text-ink-faint hover:text-ink"
      >
        <ChevronLeft size={16} />
        Back
      </Link>
      <h1 className="mt-3 font-warm text-2xl">Settings</h1>

      <section className="mt-5 rounded-lg border border-rule bg-paper-raised p-4">
        <h2 className="text-sm font-semibold">Your Gemini API key</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
          {/* §14 — settings copy, verbatim */}
          Your API key is stored only in this browser and never sent to our
          servers — scan requests go directly from your device to Google.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type={reveal ? "text" : "password"}
            value={key}
            onChange={(e) => onKeyInput(e.target.value)}
            placeholder="AIza…"
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-rule bg-paper px-3 font-mono text-sm"
          />
          <Button
            size="icon"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide key" : "Show key"}
          >
            {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
          </Button>
        </div>
        <div
          className="mt-2 flex min-h-5 items-center gap-1 text-xs"
          aria-live="polite"
        >
          {check === "checking" && (
            <span className="text-ink-faint">Checking key…</span>
          )}
          {check === "ok" && (
            <span className="flex items-center gap-1 font-semibold text-settle-paid">
              <Check size={14} /> Key works
            </span>
          )}
          {check === "bad" && (
            <span className="flex items-center gap-1 font-semibold text-settle-pending">
              <X size={14} /> Key didn't work — check it and try again
            </span>
          )}
        </div>
        <label className="mt-1 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              if (check === "ok") setUserKey(key.trim(), e.target.checked);
            }}
          />
          Remember on this device
        </label>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              clearUserKey();
              setKey("");
              setCheck("idle");
            }}
          >
            Clear key
          </Button>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="pressable flex min-h-9 items-center gap-1.5 rounded-lg border border-rule px-3 text-xs font-semibold hover:bg-paper"
          >
            Get a free key
            <ExternalLink size={12} />
          </a>
        </div>
        <details className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          <summary className="cursor-pointer font-semibold">
            20-second walkthrough
          </summary>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>
              Open aistudio.google.com/apikey (link above) and sign in with any
              Google account.
            </li>
            <li>Tap "Create API key" — the free tier needs no card.</li>
            <li>
              Copy the key and paste it here. The green check means you're done.
            </li>
          </ol>
        </details>
      </section>

      <section className="mt-4 rounded-lg border border-rule bg-paper-raised p-4">
        <h2 className="text-sm font-semibold">Model</h2>
        <select
          value={s.model}
          onChange={(e) => s.setModel(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-paper px-2 text-sm"
        >
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-ink-faint">
          Switch to Flash if you hit rate limits or want more accuracy.
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-rule bg-paper-raised p-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={s.alwaysOnDevice}
            onChange={(e) => s.setAlwaysOnDevice(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">Always scan on this device</span>
            <span className="mt-1 block text-[11px] leading-relaxed text-ink-faint">
              {/* §14 — the toggle that makes the privacy copy credible */}
              Uses on-device OCR only. Your photo never leaves this phone —
              slightly less accurate, completely private.
            </span>
          </span>
        </label>
      </section>

      <section className="mt-4 rounded-lg border border-rule bg-paper-raised p-4">
        <h2 className="text-sm font-semibold">
          Your name (for payment requests)
        </h2>
        <input
          value={s.payerName}
          onChange={(e) => s.setPayerName(e.target.value)}
          placeholder="Shown in the payer's UPI app"
          className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-paper px-3 text-sm"
        />
      </section>

      <section className="mt-4 rounded-lg border border-rule bg-paper-raised p-4">
        <h2 className="text-sm font-semibold">About</h2>
        <div className="mt-2 divide-y divide-rule">
          <a
            href="https://github.com/xditya/splitty"
            target="_blank"
            rel="noreferrer"
            className="pressable flex min-h-11 items-center gap-2.5 text-sm text-ink-faint hover:text-ink"
          >
            <GithubIcon size={16} />
            <span className="flex-1">View on GitHub</span>
            <ExternalLink size={13} />
          </a>
          <a
            href="https://xditya.me"
            target="_blank"
            rel="noreferrer"
            className="pressable flex min-h-11 items-center gap-2.5 text-sm text-ink-faint hover:text-ink"
          >
            <Globe size={16} />
            <span className="flex-1">Built by Aditya</span>
            <ExternalLink size={13} />
          </a>
        </div>
      </section>
    </div>
  );
}
