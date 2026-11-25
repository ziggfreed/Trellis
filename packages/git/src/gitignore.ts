/**
 * Adding patterns to the repository's .gitignore ("ignore this file / all
 * .log files / this folder"), and untracking files that are already
 * committed (ignoring only affects files git isn't tracking yet).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit } from './run-git'

export type IgnoreKind = 'file' | 'extension' | 'folder'

/**
 * Escape characters that mean something in .gitignore patterns, so a file
 * called "[draft].md" is matched literally. ("#" and "!" only matter at the
 * start of a line, and our patterns start with "/" or "*".)
 */
function escapePattern(text: string): string {
  return text.replace(/[\\*?[\]]/g, '\\$&').replace(/ $/, '\\ ')
}

/**
 * The .gitignore line for `path` (relative, "/"-separated):
 *   file       "/src/debug.log"   (just this file; the leading / anchors it)
 *   extension  "*.log"            (every .log file, anywhere)
 *   folder     "/src/build/"      (the file's folder, or the path if it's a folder)
 * Returns null when the choice doesn't apply (no extension, or a file at
 * the top level for "folder").
 */
export function ignorePattern(path: string, kind: IgnoreKind): string | null {
  const clean = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const name = clean.slice(clean.lastIndexOf('/') + 1)
  switch (kind) {
    case 'file':
      return `/${clean.split('/').map(escapePattern).join('/')}`
    case 'extension': {
      const dot = name.lastIndexOf('.')
      // ".env" is a name, not an extension.
      return dot > 0 ? `*${escapePattern(name.slice(dot))}` : null
    }
    case 'folder': {
      const slash = clean.lastIndexOf('/')
      const folder = path.endsWith('/') ? clean : slash > 0 ? clean.slice(0, slash) : ''
      return folder ? `/${folder.split('/').map(escapePattern).join('/')}/` : null
    }
  }
}

/**
 * Append `pattern` to the .gitignore at the repository root (created if
 * missing). Does nothing if the exact line is already there.
 * Returns whether the file changed.
 */
export async function addToGitignore(repoPath: string, pattern: string): Promise<boolean> {
  const file = join(repoPath, '.gitignore')
  let content = ''
  try {
    content = await readFile(file, 'utf8')
  } catch {
    // No .gitignore yet.
  }
  const lines = content.split(/\r?\n/)
  if (lines.includes(pattern)) return false
  // Keep the file's line endings, and make sure the new line starts on its own line.
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const prefix = content === '' || content.endsWith('\n') ? '' : eol
  await writeFile(file, `${content}${prefix}${pattern}${eol}`)
  return true
}

/**
 * Stop tracking `paths` but leave the files on disk (`git rm --cached`), so
 * a newly added ignore pattern takes effect for files already committed.
 */
export async function untrack(repoPath: string, paths: string[]): Promise<void> {
  if (!paths.length) return
  await runGit(['rm', '--cached', '-r', '--quiet', '--', ...paths], { cwd: repoPath })
}

/** Whether git tracks `path` (a file or anything inside a folder). */
export async function isTracked(repoPath: string, path: string): Promise<boolean> {
  const { stdout } = await runGit(['ls-files', '--', path], { cwd: repoPath })
  return stdout.trim() !== ''
}

/**
 * Tracked files that match the ignore rules: after adding a pattern, these
 * are the files git would ignore if it weren't already tracking them.
 */
export async function trackedIgnoredFiles(repoPath: string): Promise<string[]> {
  const { stdout } = await runGit(
    ['ls-files', '-z', '--cached', '--ignored', '--exclude-standard'],
    {
      cwd: repoPath,
    },
  )
  return stdout.split('\0').filter(Boolean)
}
