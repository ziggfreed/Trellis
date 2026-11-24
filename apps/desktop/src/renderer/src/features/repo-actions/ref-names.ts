/**
 * Checks branch and tag names against git's rules (`git check-ref-format`),
 * so we can explain a problem as the user types instead of waiting for git
 * to reject the name.
 */

/** Returns a message describing the problem, or null if the name is valid. */
export function validateRefName(name: string): string | null {
  if (name.trim() === '') return 'Enter a name.'
  if (/\s/.test(name)) return 'Names can’t contain spaces.'
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) return 'Names can’t contain control characters.'
  if (/[~^:?*[\\]/.test(name)) return 'Names can’t contain ~ ^ : ? * [ or \\.'
  if (name.startsWith('-')) return 'Names can’t start with “-”.'
  if (name.includes('..')) return 'Names can’t contain “..”.'
  if (name.includes('@{')) return 'Names can’t contain “@{”.'
  if (name === '@') return '“@” on its own isn’t allowed.'
  if (name.startsWith('/') || name.endsWith('/') || name.includes('//')) {
    return 'Slashes must separate words, like “feature/login”.'
  }
  if (name.endsWith('.')) return 'Names can’t end with “.”.'
  for (const part of name.split('/')) {
    if (part.startsWith('.')) return 'No part of the name can start with “.”.'
    if (part.endsWith('.lock')) return 'No part of the name can end with “.lock”.'
  }
  return null
}

/**
 * Turn free text into a valid-looking branch name: "Fix login bug!" ->
 * "fix-login-bug". Used to suggest a name; the user can still edit it.
 */
export function suggestBranchName(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-./]+|[-./]+$/g, '')
}
