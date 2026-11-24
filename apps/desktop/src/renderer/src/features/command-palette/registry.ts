/**
 * The command registry: every action available in the command palette.
 *
 * Commands come from "providers": functions that, given the current context
 * (which repository is open), return the commands that make sense right now.
 * The built-in commands are one provider (./built-in-commands.ts). In
 * Phase 5, plugins will register providers too, through this same API.
 */
import type { RepoTab, Ref, RepoStatus, Workspace } from '@shared/ipc'

export interface CommandContext {
  /** The repository in the active tab, or null on the home screen. */
  repo: RepoTab | null
  /** Its status and branches, when loaded. */
  status: RepoStatus | null
  refs: Ref[]
  openTabs: RepoTab[]
  workspaces: Workspace[]
}

/** A list the palette shows after a command is chosen, e.g. branches to check out. */
export interface CommandPicker {
  placeholder: string
  items: { id: string; label: string; detail?: string; run: () => void }[]
}

export interface Command {
  /** Unique id, e.g. "git.push". Plugins should prefix theirs with the plugin name. */
  id: string
  title: string
  /** Heading the command is listed under, e.g. "Git" or "View". */
  group: string
  /** Shortcut to show next to it (display only; shortcuts are handled elsewhere). */
  shortcut?: string
  /** Extra words that should find this command in a search. */
  keywords?: string[]
  /** Run the command, OR return a picker to choose from first. */
  run: () => void | CommandPicker
}

export type CommandProvider = (context: CommandContext) => Command[]

const providers = new Set<CommandProvider>()

/** Add a provider. Returns a function that removes it again. */
export function registerCommands(provider: CommandProvider): () => void {
  providers.add(provider)
  return () => providers.delete(provider)
}

/** All commands available in this context, in registration order. */
export function getCommands(context: CommandContext): Command[] {
  return [...providers].flatMap((provider) => provider(context))
}
