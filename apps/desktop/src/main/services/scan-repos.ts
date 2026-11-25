/**
 * Find the git repositories inside a folder (Home > "Scan folder…").
 *
 * Walks the folder tree breadth-first, a few levels deep, looking for
 * folders that contain ".git". It doesn't look inside a repository once
 * found (so submodules and vendored repositories aren't listed), and skips
 * hidden folders and node_modules, which can be huge and never hold a
 * project of their own.
 *
 * Limits keep a scan of, say, a whole home folder quick and bounded; the
 * result says if a limit was hit so the UI can mention it.
 */
import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { RepoTab, ScanResult } from '@shared/ipc'

export interface ScanOptions {
  /** How many folder levels below the chosen folder to look. Default 4. */
  maxDepth?: number
  /** Stop after finding this many repositories. Default 500. */
  maxRepos?: number
  /** Stop after looking in this many folders. Default 20,000. */
  maxFolders?: number
}

/** Folder names never worth looking inside. */
const SKIP = new Set(['node_modules', '$RECYCLE.BIN', 'System Volume Information'])

/**
 * Scan `root` for repositories. `resolveRoot` turns a folder containing
 * ".git" into the repository's root path exactly as opening it would (or
 * null if git doesn't accept it), so scanned repositories match tabs that
 * are already open.
 */
export async function scanForRepos(
  root: string,
  resolveRoot: (folder: string) => Promise<string | null>,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const { maxDepth = 4, maxRepos = 500, maxFolders = 20_000 } = options
  const candidates: string[] = []
  let truncated = false
  let visited = 0

  // Breadth-first, so shallow repositories are found before limits are hit.
  let level = [root]
  for (let depth = 0; level.length > 0 && depth <= maxDepth; depth++) {
    const next: string[] = []
    for (const folder of level) {
      if (visited >= maxFolders || candidates.length >= maxRepos) {
        truncated = true
        break
      }
      visited++
      let entries
      try {
        entries = await readdir(folder, { withFileTypes: true })
      } catch {
        continue // no permission, or removed while scanning
      }
      // ".git" is a folder in a normal repository and a file in worktrees
      // and submodules.
      if (entries.some((e) => e.name === '.git' && (e.isDirectory() || e.isFile()))) {
        candidates.push(folder)
        continue
      }
      for (const entry of entries) {
        // isDirectory() is false for symbolic links, so links aren't followed
        // (they could loop forever).
        if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP.has(entry.name)) continue
        next.push(join(folder, entry.name))
      }
    }
    if (truncated) break
    level = next
  }

  // Ask git for each repository's root, a few at a time.
  const roots = new Map<string, RepoTab>()
  for (let i = 0; i < candidates.length; i += 8) {
    const batch = candidates.slice(i, i + 8)
    const resolved = await Promise.all(batch.map((f) => resolveRoot(f).catch(() => null)))
    for (const path of resolved) if (path) roots.set(path, { path, name: basename(path) })
  }
  const repos = [...roots.values()].sort((a, b) => a.path.localeCompare(b.path))
  return { repos, truncated }
}
