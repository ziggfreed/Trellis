/**
 * Where a repository keeps its git files (the .git folder, the index, the
 * undo log...), remembered after the first lookup.
 *
 * WHY: finding them takes a `git rev-parse`, and staging one file used to
 * ask the same question five times. Starting a process is cheap on Linux
 * but slow on Windows (and antivirus often scans each one), so it showed.
 * The answer only changes if the repository is deleted or moved, so each
 * cached path is checked against the disk before it's trusted.
 */
import { existsSync } from 'node:fs'
import { runGit } from './run-git'

const gitDirs = new Map<string, string>()
const gitPaths = new Map<string, string>()

/** The repository's git folder as an absolute path (for a worktree, its own folder). */
export async function gitDir(repoPath: string): Promise<string> {
  const cached = gitDirs.get(repoPath)
  if (cached && existsSync(cached)) return cached
  const { stdout } = await runGit(['rev-parse', '--absolute-git-dir'], { cwd: repoPath })
  const dir = stdout.trim()
  gitDirs.set(repoPath, dir)
  return dir
}

/**
 * Absolute path of a file in the git folder, as `git rev-parse --git-path`
 * gives it (which knows which files worktrees share). The file itself
 * needn't exist yet.
 */
export async function gitPath(repoPath: string, name: string): Promise<string> {
  const key = `${repoPath}\0${name}`
  const cached = gitPaths.get(key)
  // Trust it while the git folder it's in still exists.
  if (cached && existsSync(await gitDir(repoPath))) return cached
  const { stdout } = await runGit(['rev-parse', '--path-format=absolute', '--git-path', name], {
    cwd: repoPath,
  })
  const path = stdout.trim()
  gitPaths.set(key, path)
  return path
}
