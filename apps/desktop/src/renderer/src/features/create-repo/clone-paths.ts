/**
 * Pure helpers for the clone dialog: guessing the folder name from a URL and
 * joining paths. The UI can't use Node's `path` module, so these are written
 * to work with both Windows (\) and Unix (/) paths.
 */

/**
 * Suggest a folder name from a clone URL, like git does:
 *   https://github.com/user/my-repo.git -> "my-repo"
 *   git@github.com:user/my-repo         -> "my-repo"
 */
export function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/[\\/]+$/, '')
  const last = trimmed.split(/[\\/:]/).pop() ?? ''
  return last.replace(/\.git$/, '')
}

/** Join a folder and a name using the folder's own separator style. */
export function joinPath(folder: string, name: string): string {
  const separator = folder.includes('\\') && !folder.includes('/') ? '\\' : '/'
  return folder.replace(/[\\/]+$/, '') + separator + name
}

/**
 * Check a folder name the user typed. Returns an error message, or null if
 * it's fine. Blocks characters that are invalid on Windows (the strictest
 * platform) and names that would escape the chosen folder.
 */
export function validateFolderName(name: string): string | null {
  if (name.trim() === '') return 'Enter a folder name.'
  if (/[<>:"/\\|?*]/.test(name)) return 'The name can’t contain < > : " / \\ | ? *'
  if (name === '.' || name === '..') return 'Choose a different name.'
  return null
}
