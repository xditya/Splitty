// Layout shell: a slim brand bar (desktop-oriented; screens opt in) and the
// TwoPane grid — below lg everything renders exactly as the mobile layout;
// at lg+ main content sits left with a sticky 360px aside.
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { House, Settings } from './icons'
import { useBill } from '../store/bill'
import { Button } from './Button'

export function AppBar({
  right = 'home',
  className,
}: {
  right?: 'home' | 'settings' | null
  className?: string
}) {
  const setStep = useBill((s) => s.setStep)
  return (
    <div className={clsx('mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4', className)}>
      <button
        type="button"
        onClick={() => setStep('home')}
        className="pressable font-warm text-2xl tracking-tight"
      >
        Splitty
      </button>
      {right === 'home' && (
        <Button size="icon" variant="ghost" aria-label="Back to home" onClick={() => setStep('home')}>
          <House size={20} />
        </Button>
      )}
      {right === 'settings' && (
        <Link to="/settings" aria-label="Settings" className="pressable flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint hover:bg-ink/5 hover:text-ink">
          <Settings size={20} />
        </Link>
      )}
    </div>
  )
}

export function TwoPane({
  main,
  aside,
  mainClassName,
}: {
  main: React.ReactNode
  aside?: React.ReactNode
  mainClassName?: string
}) {
  return (
    <div className="mx-auto w-full max-w-md lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 lg:px-6">
      <div className={clsx('min-w-0', mainClassName)}>{main}</div>
      {aside && (
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-4 pb-10">{aside}</div>
        </aside>
      )}
    </div>
  )
}
