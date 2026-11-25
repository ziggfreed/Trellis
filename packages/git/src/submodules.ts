/**
 * Submodules: other repositories nested inside this one at a pinned commit
 * (declared in .gitmodules).
 *
 * After cloning, a submodule's folder is empty until it's initialised and
 * updated (`git submodule update --init`). The superproject records one
 * commit per submodule; when the submodule's checkout moves away from it,
 * the submodule shows up as changed.
 */
import { runGit } from './run-git'
import { remoteRunOptions, type RemoteOptions } from './write-ops'
import type { Submodule } from './types'

/**
 * Parse `git submodule status`. Each line is "<flag><sha> <path>[ (<describe>)]":
 *   "-" not initialised · "+" checked out at a different commit than recorded
 *   "U" merge conflict  · " " checked out at the recorded commit
 */
export function parseSubmoduleStatus(
  output: string,
): { path: string; sha: string; state: Submodule['state'] }[] {
  return output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const flag = line[0]
      const match = /^.([0-9a-f]+) (.+?)(?: \(.*\))?$/.exec(line)
      const state: Submodule['state'] =
        flag === '-' ? 'uninitialized' : flag === '+' ? 'changed' : flag === 'U' ? 'conflict' : 'ok'
      return { sha: match?.[1] ?? '', path: match?.[2] ?? line.slice(1), state }
    })
}

/** Parse `git config -f .gitmodules --get-regexp ^submodule\.` into name → {path, url}. */
export function parseGitmodules(output: string): Map<string, { path?: string; url?: string }> {
  const modules = new Map<string, { path?: string; url?: string }>()
  for (const line of output.split('\n')) {
    const match = /^submodule\.(.+)\.(path|url) (.*)$/.exec(line)
    if (!match) continue
    const [, name, key, value] = match as unknown as [string, string, 'path' | 'url', string]
    modules.set(name, { ...modules.get(name), [key]: value })
  }
  return modules
}

/** The repository's submodules (top level; nested ones show when opened as a tab). */
export async function getSubmodules(repoPath: string): Promise<Submodule[]> {
  const config = await runGit(
    ['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\.'],
    { cwd: repoPath, okExitCodes: [0, 1] }, // 1: no .gitmodules / no entries
  )
  const declared = parseGitmodules(config.stdout)
  if (declared.size === 0) return []
  const status = await runGit(['submodule', 'status'], { cwd: repoPath, okExitCodes: [0, 1] })
  const states = new Map(parseSubmoduleStatus(status.stdout).map((s) => [s.path, s]))
  return [...declared]
    .filter(([, module]) => module.path)
    .map(([name, module]) => {
      const state = states.get(module.path!)
      return {
        name,
        path: module.path!,
        url: module.url ?? '',
        sha: state?.sha ?? '',
        state: state?.state ?? 'uninitialized',
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Initialise and check out submodules at their recorded commits (all of
 * them, or just `paths`), including nested ones. Clones over the network
 * the first time.
 */
export async function updateSubmodules(
  repoPath: string,
  paths: string[] = [],
  options: RemoteOptions = {},
): Promise<void> {
  await runGit(
    ['submodule', 'update', '--init', '--recursive', '--progress', '--', ...paths],
    remoteRunOptions(repoPath, options),
  )
}

/** Copy submodule URLs from .gitmodules into the local config (after a URL change upstream). */
export async function syncSubmodules(repoPath: string): Promise<void> {
  await runGit(['submodule', 'sync', '--recursive'], { cwd: repoPath })
}

/** Add a repository as a submodule at `path` (clones it, then stages .gitmodules and the folder). */
export async function addSubmodule(
  repoPath: string,
  url: string,
  path: string,
  options: RemoteOptions = {},
): Promise<void> {
  await runGit(
    ['submodule', 'add', '--progress', '--', url, path],
    remoteRunOptions(repoPath, options),
  )
}
