/**
 * A card on the home screen showing one tip at a time (tips.ts), with
 * buttons to flip through them, a "Learn more" link to the user guide, and
 * a button to hide tips altogether.
 *
 * It starts on a different tip each day. Hiding it turns off the
 * "Show tips on the home screen" setting (Settings > General), so it stays
 * hidden until the user turns it back on there or in the command palette.
 */
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Lightbulb, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/features/settings/settings-store'
import { shortcutLabel } from '@/features/shortcuts/shortcut-label'
import { openUserGuide } from '@/lib/help'
import { TIPS, tipIndexForDate, wrapIndex } from './tips'

export function TipsCard() {
  const showTips = useSettingsStore((s) => s.settings.showTips)
  const update = useSettingsStore((s) => s.update)
  const [index, setIndex] = useState(() => tipIndexForDate(new Date(), TIPS.length))
  const tip = TIPS[index]
  if (!showTips || !tip) return null

  const shortcut = tip.shortcut ? shortcutLabel(tip.shortcut) : undefined
  const hide = () => {
    update({ showTips: false })
    toast.info('Tips hidden', {
      description: 'Turn them back on in Settings > General, or from the command palette.',
    })
  }

  return (
    <section
      aria-labelledby="tip-title"
      aria-roledescription="tip"
      className="rounded-lg border bg-card p-4"
      data-testid="tips-card"
    >
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="tip-title" className="text-sm font-medium">
            {tip.title}
          </h2>
          {/* Announced when the tip changes, for screen reader users flipping through. */}
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {tip.body}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            {shortcut && (
              <span className="text-muted-foreground">
                Shortcut:{' '}
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-foreground">
                  {shortcut}
                </kbd>
              </span>
            )}
            {tip.page && (
              <button
                type="button"
                className="text-brand underline-offset-2 hover:underline"
                onClick={() => openUserGuide(tip.page)}
              >
                Learn more
              </button>
            )}
            <span className="ml-auto flex items-center gap-1 text-muted-foreground">
              <span className="mr-1" data-testid="tip-position">
                Tip {index + 1} of {TIPS.length}
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Previous tip"
                onClick={() => setIndex((i) => wrapIndex(i, -1, TIPS.length))}
              >
                <ChevronLeft />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Next tip"
                onClick={() => setIndex((i) => wrapIndex(i, 1, TIPS.length))}
              >
                <ChevronRight />
              </Button>
            </span>
          </div>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Hide tips"
          title="Hide tips"
          onClick={hide}
        >
          <X />
        </Button>
      </div>
    </section>
  )
}
