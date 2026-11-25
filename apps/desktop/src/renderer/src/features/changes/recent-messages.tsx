/**
 * The "recent messages" button next to the commit summary: lists your
 * recent commit messages (from the repository's history, see
 * packages/git/src/recent-messages.ts) so one can be used again, e.g. for
 * several commits on the same ticket.
 *
 * Click a message to fill in both the summary and the description, or use
 * its "Summary" / "Description" buttons to take just one part.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import type { RecentMessage } from '@shared/ipc'
import { api } from '@/lib/api'
import { repoKeys } from '@/lib/query-client'
import { formatRelativeDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function RecentMessages(props: {
  repoPath: string
  onUse: (parts: { summary?: string; description?: string }) => void
}) {
  const [open, setOpen] = useState(false)
  // Under repoKeys.all, so it refreshes after each commit.
  const { data, error } = useQuery({
    queryKey: [...repoKeys.all(props.repoPath), 'recent-messages'],
    queryFn: () => api.invoke('repo:getRecentMessages', props.repoPath),
    enabled: open,
  })
  const use = (parts: { summary?: string; description?: string }) => {
    props.onUse(parts)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="size-8 shrink-0 text-muted-foreground"
          aria-label="Recent messages"
          title="Use a recent commit message"
        >
          <History />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0" data-testid="recent-messages">
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          Your recent commit messages. Click one to use it, or take just its summary or description.
        </p>
        <div className="max-h-80 overflow-y-auto py-1">
          {error ? (
            <p className="px-3 py-2 text-sm text-destructive">{String(error)}</p>
          ) : !data ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>
          ) : data.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No commits of yours in this repository yet.
            </p>
          ) : (
            <ul>
              {data.map((message) => (
                <MessageRow
                  key={`${message.summary}\n${message.description}`}
                  message={message}
                  onUse={use}
                />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MessageRow(props: {
  message: RecentMessage
  onUse: (parts: { summary?: string; description?: string }) => void
}) {
  const { summary, description, date } = props.message
  return (
    <li className="group/msg relative">
      <button
        type="button"
        onClick={() => props.onUse({ summary, description })}
        className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        title={description ? `${summary}\n\n${description}` : summary}
      >
        <span className="w-full truncate text-sm group-focus-within/msg:pr-44 group-hover/msg:pr-44">
          {summary}
        </span>
        <span className="w-full truncate text-xs text-muted-foreground">
          {formatRelativeDate(date)}
          {description && ` · ${description.split('\n')[0]}`}
        </span>
      </button>
      {/* Use just one part (shown on hover or keyboard focus). */}
      <div className="absolute top-1 right-2 flex gap-1 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100">
        <Button
          size="xs"
          variant="outline"
          className="h-6"
          onClick={() => props.onUse({ summary })}
        >
          Summary
        </Button>
        {description && (
          <Button
            size="xs"
            variant="outline"
            className="h-6"
            onClick={() => props.onUse({ description })}
          >
            Description
          </Button>
        )}
      </div>
    </li>
  )
}
