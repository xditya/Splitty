// The one button. Variants via cva (craft R11 — every state designed).
// Tailwind v4 gates `hover:` behind (hover) media automatically, so touch
// devices never get sticky hover; press feedback comes from `.pressable`.
import { cva, type VariantProps } from 'class-variance-authority'
import { clsx } from 'clsx'

const button = cva(
  'pressable inline-flex items-center justify-center gap-2 rounded-lg font-semibold outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-paper hover:bg-ink/85',
        secondary: 'border border-rule bg-paper-raised hover:bg-paper',
        ghost: 'text-ink-faint hover:bg-ink/5 hover:text-ink',
      },
      size: {
        sm: 'min-h-9 px-3 text-xs',
        md: 'min-h-11 px-4 text-sm',
        lg: 'min-h-13 px-5 text-base',
        icon: 'h-11 w-11',
      },
      full: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>

export function Button({ variant, size, full, className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={clsx(button({ variant, size, full }), className)}
      {...rest}
    />
  )
}
