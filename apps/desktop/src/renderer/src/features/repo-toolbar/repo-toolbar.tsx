/**
 * Buttons along the top of a repository: Fetch, Pull, Push, Branch and Stash.
 * Pull and Push show how many commits there are to pull or push, and have
 * menus for the less common variants (pull with rebase, force push).
 */
import {
  ArrowDown,
  ArrowUp,
  Archive,
  ChevronDown,
  GitBranchPlus,
  Loader2,
  Redo2,
  RefreshCw,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStatus, useUndoState } from '@/features/repos/use-repo-data'
import { modKey } from '@/hooks/use-keyboard-shortcuts'
import { useOperationsStore } from '@/features/repo-actions/operations-store'
import * as actions from '@/features/repo-actions/actions'

export function RepoToolbar({ repoPath }: { repoPath: string }) {
  const branch = useStatus(repoPath).data?.branch
  const busy = useOperationsStore((s) => s.running.some((op) => op.repoPath === repoPath))
  const undoState = useUndoState(repoPath).data

  return (
    <div className="flex items-center gap-0.5" role="toolbar" aria-label="Repository actions">
      <IconButton
        label="Undo"
        tooltip={
          undoState?.undo ? `Undo: ${undoState.undo.label} (${modKey}+Z)` : 'Nothing to undo'
        }
        disabled={!undoState?.undo || busy}
        onClick={() => void actions.undo(repoPath)}
      >
        <Undo2 />
      </IconButton>
      <IconButton
        label="Redo"
        tooltip={
          undoState?.redo ? `Redo: ${undoState.redo.label} (${modKey}+Shift+Z)` : 'Nothing to redo'
        }
        disabled={!undoState?.redo || busy}
        onClick={() => void actions.redo(repoPath)}
      >
        <Redo2 />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Fetch"
        tooltip="Download new commits from all remotes"
        disabled={busy}
        onClick={() => void actions.fetchAll(repoPath)}
      >
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      </ToolbarButton>

      <SplitButton
        label="Pull"
        tooltip={branch?.upstream ? `Pull from ${branch.upstream}` : 'This branch has no upstream'}
        disabled={busy}
        onClick={() => void actions.pull(repoPath)}
        icon={<ArrowDown />}
        count={branch?.behind}
        menu={
          <DropdownMenuItem onSelect={() => void actions.pull(repoPath, true)}>
            Pull with rebase
          </DropdownMenuItem>
        }
      />

      <SplitButton
        label="Push"
        tooltip={
          branch?.upstream
            ? `Push to ${branch.upstream}`
            : 'Push and create the branch on the remote'
        }
        disabled={busy}
        onClick={() => void actions.push(repoPath)}
        icon={<ArrowUp />}
        count={branch?.ahead}
        menu={
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => void actions.push(repoPath, { force: true })}
          >
            Force push (with lease)…
          </DropdownMenuItem>
        }
      />

      <ToolbarButton
        label="Branch"
        tooltip="Create a branch"
        onClick={() => void actions.createBranch(repoPath)}
      >
        <GitBranchPlus />
      </ToolbarButton>
      <ToolbarButton
        label="Stash"
        tooltip="Put your changes aside"
        onClick={() => void actions.stash(repoPath)}
      >
        <Archive />
      </ToolbarButton>
    </div>
  )
}

function ToolbarButton(props: {
  label: string
  tooltip: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" disabled={props.disabled} onClick={props.onClick}>
          {props.children}
          {props.label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.tooltip}</TooltipContent>
    </Tooltip>
  )
}

function IconButton(props: {
  label: string
  tooltip: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A span keeps the tooltip working while the button is disabled. */}
        <span tabIndex={props.disabled ? 0 : -1}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={props.label}
            disabled={props.disabled}
            onClick={props.onClick}
          >
            {props.children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{props.tooltip}</TooltipContent>
    </Tooltip>
  )
}

/** A button with a small dropdown arrow next to it for alternative actions. */
function SplitButton(props: {
  label: string
  tooltip: string
  icon: React.ReactNode
  count?: number
  disabled?: boolean
  onClick: () => void
  menu: React.ReactNode
}) {
  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-r-none pr-1.5"
            disabled={props.disabled}
            onClick={props.onClick}
          >
            {props.icon}
            {props.label}
            {props.count ? (
              <span
                className="rounded bg-brand/20 px-1 text-xs tabular-nums"
                data-testid={`${props.label.toLowerCase()}-count`}
              >
                {props.count}
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{props.tooltip}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="w-5 rounded-l-none"
            disabled={props.disabled}
            aria-label={`More ${props.label.toLowerCase()} options`}
          >
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{props.menu}</DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
