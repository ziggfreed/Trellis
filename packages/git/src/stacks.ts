/**
 * Stacked branches: several small branches built on top of each other, e.g.
 *
 *   main ← feature-api ← feature-ui ← feature-tests
 *
 * so each can be reviewed as its own pull request. When a lower branch
 * changes (say after review), every branch above it needs rebasing. Git can
 * do that in one go: rebasing the top branch with `--update-refs` moves
 * every branch pointing into the rebased commits too (git 2.38+).
 *
 * A branch's stack, relative to a base branch (usually main), is the local
 * branches whose tips lie on the first-parent path from the base to it.
 */
import { runGit } from './run-git'
import { remoteRunOptions, type RemoteOptions } from './write-ops'
import type { StackBranch } from './types'

/**
 * Parse `git log --first-parent --decorate-refs=refs/heads/ --format=%H%x00%D
 * <base>..<top>` (newest first) into the stack, bottom first. Each branch
 * gets the number of commits since the branch below it.
 */
export function parseStack(output: string): StackBranch[] {
  const lines = output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', decorations = ''] = line.split('\0')
      const names = decorations
        .split(', ')
        .map((name) => name.replace(/^HEAD -> /, '').trim())
        .filter((name) => name && name !== 'HEAD')
      return { sha, names }
    })
    .reverse() // oldest first

  const stack: StackBranch[] = []
  let commits = 0
  for (const { sha, names } of lines) {
    commits++
    for (const [index, name] of names.sort().entries()) {
      stack.push({ name, sha, commits: index === 0 ? commits : 0 })
    }
    if (names.length) commits = 0
  }
  return stack
}

/** The stack of local branches from `base` up to `top` (bottom first, `top` last). */
export async function getStack(
  repoPath: string,
  top: string,
  base: string,
): Promise<StackBranch[]> {
  const { stdout } = await runGit(
    [
      'log',
      '--first-parent',
      '--decorate-refs=refs/heads/',
      '--format=%H%x00%D',
      `${base}..${top}`,
      '--',
    ],
    { cwd: repoPath },
  )
  return parseStack(stdout)
}

/**
 * Push several branches at once with "force with lease" (needed after a
 * stack rebase, which rewrites their commits). Each remote branch is only
 * overwritten if it hasn't changed since the last fetch.
 */
export async function pushBranches(
  repoPath: string,
  remote: string,
  branches: string[],
  options: RemoteOptions = {},
): Promise<void> {
  await runGit(
    [
      'push',
      '--progress',
      '--force-with-lease',
      '--set-upstream',
      remote,
      ...branches.map((b) => `refs/heads/${b}:refs/heads/${b}`),
    ],
    remoteRunOptions(repoPath, options),
  )
}
