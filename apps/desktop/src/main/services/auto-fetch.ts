/**
 * Fetches open repositories in the background every few minutes, so ahead/
 * behind counts and remote branches stay up to date without clicking Fetch.
 *
 * Background fetches never ask for passwords: if a remote needs credentials
 * that aren't saved (in a credential helper or ssh-agent), the fetch just
 * fails quietly and the user can fetch by hand. That's done by switching
 * off the askpass helper for these commands only.
 */
import * as git from '@trellis/git'
import { runExclusive } from './repo-queue'

/** Environment for background fetches: no prompts of any kind. */
const NO_PROMPTS = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
  SSH_ASKPASS_REQUIRE: 'never',
}

export class AutoFetcher {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    /** The repositories to fetch (the open tabs). */
    private readonly getRepos: () => string[],
    /** Called after a repository was fetched, so the UI can refresh. */
    private readonly onFetched: (repoPath: string) => void,
  ) {}

  /** Fetch every `minutes` minutes, or stop if 0. */
  configure(minutes: number): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (minutes > 0) this.timer = setInterval(() => void this.fetchAll(), minutes * 60_000)
  }

  dispose(): void {
    this.configure(0)
  }

  private async fetchAll(): Promise<void> {
    if (this.running) return // the previous round is still going (slow network)
    this.running = true
    try {
      for (const repo of this.getRepos()) {
        try {
          await runExclusive(repo, () => git.fetch(repo, 'all', { env: NO_PROMPTS }))
          this.onFetched(repo)
        } catch {
          // Offline, or credentials needed: try again next time.
        }
      }
    } finally {
      this.running = false
    }
  }
}
