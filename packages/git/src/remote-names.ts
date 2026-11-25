/**
 * Checking remote names. Pure (no git, no Node APIs) so the UI can use it
 * too, via "@trellis/git/remote-names".
 */

/**
 * A remote name git accepts. Git's own rule is the ref-name rule (it must
 * work as `refs/remotes/<name>/...`); this simpler check catches typos with a
 * clear message, and `git remote add` still has the final say.
 */
export function remoteNameProblem(name: string): string | null {
  const value = name.trim()
  if (!value) return 'Enter a name, e.g. origin or upstream.'
  if (value.startsWith('-')) return 'A remote name can’t start with "-".'
  if (/[\s~^:?*[\\]|\.\.|\/\/|^\/|\/$|\.lock$|^\.|@\{/.test(value)) {
    return 'Use letters, numbers, "-", "_" and "." (no spaces).'
  }
  return null
}
