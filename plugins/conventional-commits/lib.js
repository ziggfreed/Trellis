/**
 * Pure helpers for Conventional Commits (https://www.conventionalcommits.org):
 * messages like "feat(parser): support arrays" or "fix!: drop Node 16".
 * Kept separate from index.js so they can be unit tested (lib.test.js).
 */

/** What each standard type is for, shown when choosing one. */
export const TYPE_HELP = /** @type {Record<string, string>} */ ({
  feat: 'A new feature',
  fix: 'A bug fix',
  docs: 'Documentation only',
  style: 'Formatting, no code change',
  refactor: 'Code change that neither fixes a bug nor adds a feature',
  perf: 'A performance improvement',
  test: 'Adding or fixing tests',
  build: 'Build system or dependencies',
  ci: 'Continuous integration setup',
  chore: 'Other changes that don’t touch the source or tests',
  revert: 'Reverts an earlier commit',
})

/**
 * "feat, fix ,docs" -> ["feat", "fix", "docs"]
 * @param {string} text
 */
export function parseTypes(text) {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter((t) => /^[a-z][a-z0-9-]*$/i.test(t))
}

/**
 * Whether a commit subject follows the convention with one of `types`.
 * Merge commits git writes itself ("Merge branch ...") are accepted.
 * @param {string} subject
 * @param {string[]} types
 */
export function isConventional(subject, types) {
  if (/^Merge (branch|pull request|remote-tracking branch|tag) /.test(subject)) return true
  const match = /^([a-z][a-z0-9-]*)(\([^()\s][^()]*\))?!?: \S/i.exec(subject)
  return match !== null && types.includes(/** @type {string} */ (match[1]).toLowerCase())
}

/**
 * Build a message: "type(scope)!: description", then an optional body.
 * @param {{ type: string, scope?: string, breaking?: boolean, description: string, body?: string }} parts
 */
export function formatMessage({ type, scope, breaking, description, body }) {
  const head = `${type}${scope?.trim() ? `(${scope.trim()})` : ''}${breaking ? '!' : ''}: ${description.trim()}`
  return body?.trim() ? `${head}\n\n${body.trim()}` : head
}
