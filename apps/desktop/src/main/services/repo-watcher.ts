/**
 * Watches open repositories for file changes and reports them, so the UI
 * refreshes when you edit files or run git in a terminal.
 *
 * Uses @parcel/watcher (the same native watcher VS Code uses), which is fast
 * and handles large folders well on Windows, macOS and Linux.
 *
 * Events are debounced: a single `git checkout` can touch thousands of files,
 * so we wait until things are quiet for DEBOUNCE_MS before reporting once.
 */
import { relative } from 'node:path'
import watcher, { type AsyncSubscription } from '@parcel/watcher'
import { classifyChange, mergeScopes, type ChangeScope } from './classify-change'

const DEBOUNCE_MS = 300

/**
 * Folders we never watch. Changes inside them are frequent and either don't
 * matter to git (objects are covered by ref changes) or are almost always
 * ignored by .gitignore (dependency folders).
 */
const IGNORE = ['.git/objects', '.git/logs', 'node_modules']

type ChangeListener = (repoPath: string, scope: 'status' | 'all') => void

interface WatchedRepo {
  subscription: Promise<AsyncSubscription | null>
  pending: ChangeScope
  timer: NodeJS.Timeout | null
}

export class RepoWatcher {
  private readonly repos = new Map<string, WatchedRepo>()

  constructor(private readonly onChange: ChangeListener) {}

  /** Watch exactly these repositories: start new ones, stop removed ones. */
  setWatched(paths: string[]): void {
    const wanted = new Set(paths)
    for (const path of this.repos.keys()) {
      if (!wanted.has(path)) this.unwatch(path)
    }
    for (const path of wanted) {
      if (!this.repos.has(path)) this.watch(path)
    }
  }

  /** Stop watching everything (call before the app quits). */
  dispose(): void {
    for (const path of [...this.repos.keys()]) this.unwatch(path)
  }

  private watch(repoPath: string): void {
    const repo: WatchedRepo = { subscription: Promise.resolve(null), pending: null, timer: null }
    this.repos.set(repoPath, repo)

    repo.subscription = watcher
      .subscribe(
        repoPath,
        (error, events) => {
          if (error) return // e.g. the folder was deleted; nothing useful to do
          for (const event of events) {
            // Normalise to forward slashes so classification works on Windows too.
            const rel = relative(repoPath, event.path).replaceAll('\\', '/')
            repo.pending = mergeScopes(repo.pending, classifyChange(rel))
          }
          if (repo.pending) this.schedule(repoPath, repo)
        },
        { ignore: IGNORE },
      )
      .catch((error: unknown) => {
        // Watching is a convenience: if it fails (e.g. too many files on
        // Linux), the app still works and refreshes on window focus.
        console.warn(`Could not watch ${repoPath}:`, error)
        return null
      })
  }

  private schedule(repoPath: string, repo: WatchedRepo): void {
    if (repo.timer) clearTimeout(repo.timer)
    repo.timer = setTimeout(() => {
      repo.timer = null
      const scope = repo.pending
      repo.pending = null
      if (scope) this.onChange(repoPath, scope)
    }, DEBOUNCE_MS)
  }

  private unwatch(repoPath: string): void {
    const repo = this.repos.get(repoPath)
    if (!repo) return
    this.repos.delete(repoPath)
    if (repo.timer) clearTimeout(repo.timer)
    void repo.subscription.then((sub) => sub?.unsubscribe())
  }
}
