/**
 * The "Filter" button in the history toolbar and its popover: filter
 * commits by author, file or folder, date range, or code that was added or
 * removed (git's "pickaxe" search).
 *
 * Fields update the repository view state as you type; HistoryPanel waits
 * for a pause, asks git for matching commits, and the list highlights them
 * (dimming the rest) just like the search box.
 */
import { ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { cn } from '@/lib/utils'
import { activeFilterCount, type HistoryFilter } from './history-filter'

export function FilterPopover({ repoPath }: { repoPath: string }) {
  const [view, setView] = useRepoView(repoPath)
  const filter = view.filter
  const count = activeFilterCount(filter)
  const set = (key: keyof HistoryFilter, value: string) =>
    setView({ filter: { ...filter, [key]: value } })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(count ? 'text-brand' : 'text-muted-foreground')}
          aria-label={count ? `Filter (${count} active)` : 'Filter'}
        >
          <ListFilter />
          Filter
          {count > 0 && (
            <span className="rounded-full bg-brand px-1.5 text-[10px] leading-4 text-brand-foreground">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3" aria-label="Filter commits">
        <p className="text-xs text-muted-foreground">
          Matching commits are highlighted; use the arrows to jump between them.
        </p>
        <Field id="filter-author" label="Author">
          <Input
            id="filter-author"
            value={filter.author ?? ''}
            placeholder="Name or email"
            onChange={(e) => set('author', e.target.value)}
          />
        </Field>
        <Field id="filter-path" label="File or folder">
          <Input
            id="filter-path"
            value={filter.path ?? ''}
            placeholder="e.g. src/app or *.css"
            spellCheck={false}
            onChange={(e) => set('path', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field id="filter-since" label="Committed from">
            <Input
              id="filter-since"
              type="date"
              value={filter.since ?? ''}
              onChange={(e) => set('since', e.target.value)}
            />
          </Field>
          <Field id="filter-until" label="To">
            <Input
              id="filter-until"
              type="date"
              value={filter.until ?? ''}
              onChange={(e) => set('until', e.target.value)}
            />
          </Field>
        </div>
        <Field
          id="filter-content"
          label="Code added or removed"
          help="Commits whose changes add or remove this exact text. Can be slow in large repositories."
        >
          <Input
            id="filter-content"
            value={filter.content ?? ''}
            placeholder="e.g. functionName"
            spellCheck={false}
            className="font-mono"
            onChange={(e) => set('content', e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="xs"
            disabled={count === 0}
            onClick={() => setView({ filter: {} })}
          >
            Clear filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Field(props: { id: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id} className="text-xs">
        {props.label}
      </Label>
      {props.children}
      {props.help && <p className="text-[11px] text-muted-foreground">{props.help}</p>}
    </div>
  )
}
