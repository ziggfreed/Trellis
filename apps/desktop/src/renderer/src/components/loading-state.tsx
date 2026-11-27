/**
 * A spinner and a short message for a view that's waiting for git
 * ("Loading history…", "Comparing…").
 *
 * It appears only after a short delay: most loads finish sooner, and a
 * spinner that flashes for a split second feels slower than none.
 */
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

/** How long to wait before showing the spinner. */
const SHOW_AFTER_MS = 200

export function LoadingState({ label }: { label: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="loading-state"
      className="flex h-full min-h-16 items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      {visible && (
        <>
          <Loader2 className="size-4 animate-spin" />
          {label}
        </>
      )}
    </div>
  )
}
