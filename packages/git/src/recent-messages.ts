/**
 * Recent commit messages, so the commit box can offer them again (handy
 * when several commits for one ticket share a summary or description).
 *
 * They come straight from the repository's history rather than a separate
 * store, so commits made in other tools or on other machines count too.
 */
import { getGitIdentity } from './identity'
import { runGit } from './run-git'
import type { RecentMessage } from './types'

/** How many commits to look through; the list keeps the newest unique ones. */
const SCAN_LIMIT = 300

/**
 * Parse `git log --format=%x1e%s%x1f%b%x1f%ct` output, newest first, keeping
 * the first (newest) copy of each message and at most `limit` of them.
 */
export function parseRecentMessages(output: string, limit: number): RecentMessage[] {
  const seen = new Set<string>()
  const messages: RecentMessage[] = []
  for (const record of output.split('\x1e')) {
    if (!record.trim()) continue
    const [summary = '', body = '', time = '0'] = record.split('\x1f')
    const message = {
      summary: summary.trim(),
      description: body.trim(),
      date: Number(time.trim()) * 1000,
    }
    const key = `${message.summary}\n${message.description}`
    if (!message.summary || seen.has(key)) continue
    seen.add(key)
    messages.push(message)
    if (messages.length >= limit) break
  }
  return messages
}

/**
 * The newest distinct messages of commits by the current git user (by
 * user.email; anyone's if it isn't set), on any local branch or HEAD.
 * Merge commits are skipped, since git writes their messages itself.
 */
export async function getRecentMessages(repoPath: string, limit = 20): Promise<RecentMessage[]> {
  const { email } = await getGitIdentity(repoPath)
  const result = await runGit(
    [
      'log',
      'HEAD',
      '--branches',
      '--no-merges',
      `--max-count=${SCAN_LIMIT}`,
      '--format=%x1e%s%x1f%b%x1f%ct',
      // -F: match the email as plain text, not a regular expression.
      ...(email ? ['-F', `--author=<${email}>`] : []),
      '--',
    ],
    // 128: no commits yet (HEAD doesn't exist).
    { cwd: repoPath, okExitCodes: [0, 128] },
  )
  return result.exitCode === 0 ? parseRecentMessages(result.stdout, limit) : []
}
