/**
 * Toolbar controls shown while the history is in timeline view:
 * - the branch picker: a searchable list of every local and remote branch
 *   with a tick for each one that gets a track (handy for following just
 *   the branches involved in a problem), and
 * - "Merged branches": also show branches that were merged and deleted.
 *
 * Until you tick or untick something the timeline uses its default choice
 * (local branches and recently active remote ones); "Use default" goes back
 * to it.
 */
import { Check, ChevronDown, GitMerge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { cn } from '@/lib/utils'
import { trackableRefs } from './timeline-refs'
import { useTimelineRefs } from './use-timeline-data'

export function TimelineControls({ repoPath }: { repoPath: string }) {
  const [view, setView] = useRepoView(repoPath)
  return (
    <>
      <BranchPicker repoPath={repoPath} />
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={view.timelineShowMerged}
        aria-label="Merged branches"
        title="Also show branches that were merged and deleted, named from their merge commits"
        className={cn(
          'text-muted-foreground',
          view.timelineShowMerged && 'bg-accent text-foreground',
        )}
        onClick={() => setView({ timelineShowMerged: !view.timelineShowMerged })}
      >
        <GitMerge />
        <span className="hidden @4xl:inline">Merged branches</span>
      </Button>
    </>
  )
}

function BranchPicker({ repoPath }: { repoPath: string }) {
  const [view, setView] = useRepoView(repoPath)
  const { tracks, refs } = useTimelineRefs(repoPath)
  const shown = new Set(tracks.map((ref) => ref.fullName))
  const branches = trackableRefs(refs)
  const local = branches.filter((ref) => ref.type === 'branch')
  const remote = branches.filter((ref) => ref.type === 'remote-branch')

  const toggle = (fullName: string) => {
    const next = new Set(shown)
    if (next.has(fullName)) next.delete(fullName)
    else next.add(fullName)
    setView({ timelineRefs: [...next] })
  }

  const item = (ref: (typeof branches)[number]) => (
    <CommandItem
      key={ref.fullName}
      value={ref.fullName}
      keywords={[ref.name]}
      onSelect={() => toggle(ref.fullName)}
      data-checked={shown.has(ref.fullName) || undefined}
    >
      <Check className={cn('size-4', !shown.has(ref.fullName) && 'invisible')} />
      <span className="truncate">{ref.name}</span>
      {ref.isHead && <span className="ml-auto text-xs text-muted-foreground">current</span>}
    </CommandItem>
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          aria-label="Timeline branches"
        >
          {view.timelineRefs ? (
            `${tracks.length} branches`
          ) : (
            <>
              Branches<span className="hidden @4xl:inline">: default</span> ({tracks.length})
            </>
          )}
          <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search branches…" aria-label="Search branches" />
          <CommandList className="max-h-72">
            <CommandEmpty>No branches found.</CommandEmpty>
            {local.length > 0 && <CommandGroup heading="Local">{local.map(item)}</CommandGroup>}
            {remote.length > 0 && <CommandGroup heading="Remote">{remote.map(item)}</CommandGroup>}
          </CommandList>
        </Command>
        <div className="flex items-center gap-1 border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={view.timelineRefs === null}
            onClick={() => setView({ timelineRefs: null })}
          >
            Use default
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={shown.size === 0}
            onClick={() => setView({ timelineRefs: [] })}
          >
            Clear
          </Button>
          <span className="ml-auto pr-2 text-xs text-muted-foreground">{shown.size} shown</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
