/**
 * Pure helpers for writing commit messages.
 *
 * Git convention: a short summary line (ideally 50 characters or fewer,
 * at most 72), a blank line, then an optional longer description.
 */

export const SUMMARY_SOFT_LIMIT = 50
export const SUMMARY_HARD_LIMIT = 72

/** Join the summary and description into one message. */
export function buildCommitMessage(summary: string, description: string): string {
  const head = summary.trim()
  const body = description.trim()
  return body ? `${head}\n\n${body}` : head
}

/** Split an existing message (e.g. the last commit's, for amending) into its two parts. */
export function splitCommitMessage(message: string): { summary: string; description: string } {
  const [summary = '', ...rest] = message.split('\n')
  return { summary: summary.trim(), description: rest.join('\n').trim() }
}

/** 'ok', 'long' (past 50) or 'too-long' (past 72), for colouring the counter. */
export function summaryLength(summary: string): 'ok' | 'long' | 'too-long' {
  const length = summary.trim().length
  if (length > SUMMARY_HARD_LIMIT) return 'too-long'
  if (length > SUMMARY_SOFT_LIMIT) return 'long'
  return 'ok'
}
