// PLAN.md §2/§9 — typing a 6-char share code, via input-otp.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { OTPInput, type SlotProps } from 'input-otp'
import { Button } from '../components/Button'
import { ChevronLeft } from '../components/icons'
import { clsx } from 'clsx'

// §9 — no-ambiguity alphabet: no 0/O/1/I/L/U
const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]*$/

function Slot(props: SlotProps) {
  return (
    <div
      className={clsx(
        'flex h-12 w-9 items-center justify-center rounded-lg border font-mono text-lg font-bold uppercase',
        props.isActive ? 'border-ink' : 'border-rule',
      )}
    >
      {props.char ?? ''}
    </div>
  )
}

export function JoinScreen() {
  const [code, setCode] = useState('')
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center px-6 py-6">
      <Link
        to="/"
        className="pressable flex items-center gap-1 self-start rounded-lg py-2 pr-3 text-sm text-ink-faint hover:text-ink"
      >
        <ChevronLeft size={16} />
        Back
      </Link>
      <h1 className="mt-10 font-warm text-2xl">Join a split</h1>
      <p className="mt-1 text-xs text-ink-faint">Enter the 6-character code from whoever paid.</p>
      <div className="mt-6">
        <OTPInput
          maxLength={6}
          value={code}
          onChange={(v) => {
            const up = v.toUpperCase()
            if (CODE_RE.test(up)) setCode(up)
          }}
          onComplete={(v) => navigate(`/s/${v.toUpperCase()}`)}
          render={({ slots }) => (
            <div className="flex gap-2">
              {slots.map((s, i) => (
                <Slot key={i} {...s} />
              ))}
            </div>
          )}
        />
      </div>
      <Button
        variant="primary"
        full
        className="mt-8"
        disabled={code.length !== 6}
        onClick={() => navigate(`/s/${code}`)}
      >
        Open split
      </Button>
    </div>
  )
}
