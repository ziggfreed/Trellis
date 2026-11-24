/**
 * Interactive rebase: reorder, reword, squash, fix up or drop commits.
 *
 * Git's `rebase -i` normally opens a text editor with a "todo" list:
 *
 *   pick 1a2b3c4 Add login page
 *   squash 5d6e7f8 Fix typo in login page
 *   drop 9a8b7c6 Debug logging
 *
 * We build that list from the user's choices in the UI and hand it to git
 * by setting GIT_SEQUENCE_EDITOR to a command that copies our file over the
 * one git wants edited.
 *
 * Rewording: git's own "reword" would open an editor for the new message.
 * Instead we "pick" the commit and follow it with
 *   exec git commit --amend -F <file with the new message>
 * Squash: git combines the messages; with GIT_EDITOR=true (set for every
 * command, see run-git.ts) it keeps the combined message as-is.
 *
 * If a commit can't be replayed cleanly, git stops with conflicts and the
 * app shows its usual "Rebase in progress" banner (continue / skip / abort).
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit } from './run-git'
import { LOG_FORMAT_ARGS, parseCommits } from './log'
import type { Commit, MergeResult, RebasePlanItem } from './types'
import { getRepoOperation } from './repo-state'
import { validateRebasePlan } from './rebase-plan'

/** Quote a path for the POSIX shell git uses to run commands (Git for Windows has one too). */
function shellQuote(path: string): string {
  return `'${path.replaceAll('\\', '/').replaceAll("'", `'\\''`)}'`
}

/**
 * Build the todo list. `messageFile(i)` gives the path of the file holding
 * the new message for plan item i (only called for rewords).
 */
export function buildRebaseTodo(plan: readonly RebasePlanItem[], messageFile: (index: number) => string): string {
  const lines: string[] = []
  plan.forEach((item, index) => {
    if (item.action === 'reword') {
      lines.push(`pick ${item.sha}`)
      lines.push(`exec git commit --amend --cleanup=whitespace --quiet -F ${shellQuote(messageFile(index))}`)
    } else {
      lines.push(`${item.action} ${item.sha}`)
    }
  })
  return lines.join('\n') + '\n'
}

export interface RebaseCommits {
  /** Commits that would be rebased, oldest first (the order git replays them). */
  commits: Commit[]
  /** True if the range contains merge commits, which interactive rebase would flatten. */
  hasMerges: boolean
}

/**
 * The commits from `base` (exclusive) to HEAD, oldest first. Pass 'root' to
 * include every commit back to the first one.
 */
export async function getRebaseCommits(repoPath: string, base: string | 'root'): Promise<RebaseCommits> {
  const range = base === 'root' ? ['HEAD'] : [`${base}..HEAD`]
  const { stdout } = await runGit(['log', ...LOG_FORMAT_ARGS, '--reverse', '--topo-order', ...range, '--'], {
    cwd: repoPath,
  })
  const commits = parseCommits(stdout)
  return { commits, hasMerges: commits.some((c) => c.parents.length > 1) }
}

/**
 * Run an interactive rebase of the commits after `base` (or all commits
 * with 'root'), following `plan` (oldest first, in the new order).
 */
export async function interactiveRebase(
  repoPath: string,
  base: string | 'root',
  plan: readonly RebasePlanItem[],
): Promise<MergeResult> {
  const problem = validateRebasePlan(plan)
  if (problem) throw new Error(problem)

  // Files live in the .git folder so they still exist if the rebase stops
  // for conflicts and is continued later.
  const { stdout } = await runGit(['rev-parse', '--path-format=absolute', '--git-path', 'trellis/rebase'], {
    cwd: repoPath,
  })
  const dir = stdout.trim()
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  const messageFile = (index: number) => join(dir, `message-${index}.txt`)
  for (const [index, item] of plan.entries()) {
    if (item.action === 'reword') await writeFile(messageFile(index), item.message!.trim() + '\n')
  }
  const todoFile = join(dir, 'todo')
  await writeFile(todoFile, buildRebaseTodo(plan, messageFile))

  // Git runs the "editor" as `<command> <path of the todo file>`, so this copies our todo over it.
  const env = { GIT_SEQUENCE_EDITOR: `cp ${shellQuote(todoFile)}` }
  const args = ['rebase', '--interactive', base === 'root' ? '--root' : base]
  try {
    await runGit(args, { cwd: repoPath, env })
    return { status: 'done' }
  } catch (error) {
    if ((await getRepoOperation(repoPath)) === 'rebase') return { status: 'conflicts' }
    throw error
  }
}
