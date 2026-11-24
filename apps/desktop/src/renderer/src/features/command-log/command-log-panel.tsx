/**
 * The "Git log" panel at the bottom of the window: every git command Trellis
 * has run, newest at the bottom, so you can see exactly what happened (and
 * copy a command to run it yourself). Read-only commands like `status` run
 * constantly, so they're hidden unless you ask for them.
 *
 * Toggle with the "Git log" button in the status bar or Ctrl+`.
 */
import { useEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useRepos } from '@/features/repos/use-repos'
import { copyToClipboard } from '@/features/repo-actions/actions'
import { formatCommand, useCommandLogStore } from './command-log-store'

const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' })

export function CommandLogPanel() {
  const { entries, open, showReadOnly, setOpen, setShowReadOnly } = useCommandLogStore()
  const { openTabs } = useRepos()
  const listRef = useRef<HTMLDivElement>(null)

  const repoNames = useMemo(
    () => new Map(openTabs.map((t) => [t.path.replaceAll('\\', '/'), t.name])),
    [openTabs],
  )
  const visible = showReadOnly ? entries : entries.filter((e) => !e.readOnly)

  // Stay scrolled to the newest command.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [visible.length, open])

  if (!open) return null

  return (
    <section className="flex h-56 shrink-0 flex-col border-t" aria-label="Git command log">
      <div className="flex h-8 shrink-0 items-center gap-3 border-b px-3 text-xs">
        <span className="font-medium">Git commands</span>
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <input
            type="checkbox"
            checked={showReadOnly}
            onChange={(e) => setShowReadOnly(e.target.checked)}
          />
          Show read-only commands
        </label>
        <span className="text-muted-foreground">Click a command to copy it.</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Close git log"
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
      </div>
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto font-mono text-xs"
        data-testid="command-log"
      >
        {visible.length === 0 && (
          <p className="p-3 font-sans text-muted-foreground">
            No commands yet. Commands Trellis runs will appear here.
          </p>
        )}
        {visible.map((entry) => {
          const failed = entry.exitCode !== 0
          const command = formatCommand(entry.args)
          return (
            <button
              key={entry.id}
              type="button"
              title={`${entry.cwd}\nClick to copy`}
              onClick={() => void copyToClipboard(command, 'command')}
              className={cn(
                'flex w-full items-baseline gap-3 px-3 py-0.5 text-left hover:bg-accent',
                entry.readOnly && 'text-muted-foreground',
              )}
            >
              <span className="shrink-0 text-muted-foreground">{time.format(entry.time)}</span>
              <span className="w-28 shrink-0 truncate font-sans text-muted-foreground">
                {repoNames.get(entry.cwd.replaceAll('\\', '/')) ?? ''}
              </span>
              <span className="min-w-0 flex-1 truncate">{command}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {entry.durationMs} ms
              </span>
              <span
                className={cn(
                  'w-14 shrink-0 text-right',
                  failed ? 'text-destructive' : 'text-change-added',
                )}
              >
                {entry.exitCode === null ? 'stopped' : failed ? `exit ${entry.exitCode}` : 'ok'}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
