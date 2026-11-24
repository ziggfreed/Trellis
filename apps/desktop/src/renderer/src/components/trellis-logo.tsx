import { cn } from '@/lib/utils'

/** The Trellis logo: a main line with a branch that splits off and merges back. */
export function TrellisLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('text-brand', className)} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M7 3v18" />
        <path d="M7 6c0 3 10 1 10 5v2c0 4-10 2-10 5" />
      </g>
      <circle cx="7" cy="4" r="2" fill="currentColor" />
      <circle cx="17" cy="12" r="2.25" fill="currentColor" />
      <circle cx="7" cy="20" r="2" fill="currentColor" />
    </svg>
  )
}
