/** The thin bar along the bottom: current branch, git version and theme switcher. */
import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  Loader2,
  Monitor,
  Moon,
  Sun,
  SquareTerminal,
  Settings as SettingsIcon,
} from 'lucide-react'
import type { ThemePreference } from '@shared/ipc'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSettingsStore } from '@/features/settings/settings-store'
import { useStatus } from '@/features/repos/use-repo-data'
import { shortSha } from '@/lib/format'
import { useOperationsStore } from '@/features/repo-actions/operations-store'
import { toggleCommandLog, useCommandLogStore } from '@/features/command-log/command-log-store'
import { openSettings } from '@/features/settings/settings-dialog'
import { PluginStatusItems } from '@/features/plugins/plugin-status-items'
import { UpdateStatusItem } from '@/features/updates/updates'

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const

interface StatusBarProps {
  gitVersion: string
  /** The active repository, or null on the home screen. */
  repoPath: string | null
}

export function StatusBar({ gitVersion, repoPath }: StatusBarProps) {
  const theme = useSettingsStore((s) => s.settings.theme)
  const update = useSettingsStore((s) => s.update)
  const ThemeIcon = THEME_ICONS[theme]

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t bg-sidebar px-3 text-xs text-muted-foreground">
      {repoPath && <BranchStatus repoPath={repoPath} />}
      <RunningOperations />
      <span className="ml-auto" />
      <UpdateStatusItem />
      <PluginStatusItems repoPath={repoPath} />
      <span>{gitVersion}</span>
      <CommandLogToggle />
      <button
        type="button"
        onClick={() => openSettings()}
        aria-label="Settings"
        title="Settings (Ctrl+,)"
        className="flex items-center hover:text-foreground"
      >
        <SettingsIcon className="size-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 capitalize hover:text-foreground">
          <ThemeIcon className="size-3.5" />
          {theme}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => update({ theme: value as ThemePreference })}
          >
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </footer>
  )
}

/** Current branch (or detached commit) and how far it is from its upstream. */
function BranchStatus({ repoPath }: { repoPath: string }) {
  const branch = useStatus(repoPath).data?.branch
  if (!branch) return null
  const label = branch.head ?? (branch.oid ? `detached at ${shortSha(branch.oid)}` : 'detached')
  return (
    <span className="flex items-center gap-3">
      <span className="flex items-center gap-1" data-testid="status-branch">
        <GitBranch className="size-3.5" />
        {label}
      </span>
      {branch.upstream && (
        <span className="flex items-center gap-2" title={`Tracking ${branch.upstream}`}>
          <span className="flex items-center">
            <ArrowUp className="size-3" />
            {branch.ahead}
          </span>
          <span className="flex items-center">
            <ArrowDown className="size-3" />
            {branch.behind}
          </span>
        </span>
      )}
    </span>
  )
}

/** "Pushing main to origin… Writing objects 45%" while remote operations run. */
function RunningOperations() {
  const running = useOperationsStore((s) => s.running)
  const latest = running.at(-1)
  if (!latest) return null
  return (
    <span
      className="flex min-w-0 items-center gap-1.5"
      role="status"
      data-testid="running-operation"
    >
      <Loader2 className="size-3 shrink-0 animate-spin" />
      <span className="truncate">
        {latest.label}…{latest.phase ? ` ${latest.phase} ${latest.percent ?? 0}%` : ''}
        {running.length > 1 ? ` (+${running.length - 1} more)` : ''}
      </span>
    </span>
  )
}

function CommandLogToggle() {
  const open = useCommandLogStore((s) => s.open)
  return (
    <button
      type="button"
      onClick={toggleCommandLog}
      aria-pressed={open}
      title="Show the git commands Trellis runs (Ctrl+`)"
      className={`flex items-center gap-1 hover:text-foreground ${open ? 'text-foreground' : ''}`}
    >
      <SquareTerminal className="size-3.5" />
      Git log
    </button>
  )
}
