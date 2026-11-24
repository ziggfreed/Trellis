/**
 * Loads the "before" and "after" versions of a file so the UI can show a diff.
 *
 * Versions can come from three places:
 *   - a commit:          `git cat-file blob <sha>:<path>`
 *   - the index (staged): `git cat-file blob :<path>`
 *   - the working tree:  read straight from disk
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit, runGitBuffer } from './run-git'
import type { DiffTarget, FileContent, FileDiffContents } from './types'

/** Files bigger than this are not loaded into the diff viewer. */
export const MAX_DIFF_FILE_SIZE = 2 * 1024 * 1024

/**
 * Git's own rule for "is this binary?": a NUL byte within the first 8000
 * bytes. Text files practically never contain NUL.
 */
export function looksBinary(data: Buffer): boolean {
  return data.subarray(0, 8000).includes(0)
}

function toContent(data: Buffer): FileContent {
  return looksBinary(data)
    ? { kind: 'binary', size: data.length }
    : { kind: 'text', text: data.toString('utf8') }
}

/**
 * Read a file from git's object database. `spec` is "<rev>:<path>" (from a
 * commit) or ":<path>" (from the index). Returns `missing` if it doesn't exist.
 */
async function readBlob(repoPath: string, spec: string): Promise<FileContent> {
  // Ask for the size first so we never load a huge file into memory.
  const size = await runGit(['cat-file', '-s', spec], { cwd: repoPath, okExitCodes: [0, 128] })
  if (size.exitCode !== 0) return { kind: 'missing' }
  const bytes = Number(size.stdout.trim())
  if (bytes > MAX_DIFF_FILE_SIZE) return { kind: 'too-large', size: bytes }

  const blob = await runGitBuffer(['cat-file', 'blob', spec], {
    cwd: repoPath,
    okExitCodes: [0, 128],
  })
  return blob.exitCode === 0 ? toContent(blob.stdout) : { kind: 'missing' }
}

/** Read a file from the working tree (with the same binary and size checks). */
export async function readWorkingFile(repoPath: string, path: string): Promise<FileContent> {
  const fullPath = join(repoPath, path)
  try {
    const info = await stat(fullPath)
    if (!info.isFile()) return { kind: 'missing' }
    if (info.size > MAX_DIFF_FILE_SIZE) return { kind: 'too-large', size: info.size }
    return toContent(await readFile(fullPath))
  } catch {
    return { kind: 'missing' }
  }
}

/** Load the old and new versions of a file for the given diff target. */
export async function getFileDiffContents(
  repoPath: string,
  target: DiffTarget,
): Promise<FileDiffContents> {
  switch (target.kind) {
    case 'commit': {
      // `<sha>^` is the first parent. For the first commit it doesn't exist,
      // so the old side is reported as missing, which is what we want.
      const oldPath = target.oldPath ?? target.path
      const [old, current] = await Promise.all([
        readBlob(repoPath, `${target.sha}^:${oldPath}`),
        readBlob(repoPath, `${target.sha}:${target.path}`),
      ])
      return { old, new: current }
    }
    case 'range': {
      const [old, current] = await Promise.all([
        readBlob(repoPath, `${target.from}:${target.oldPath ?? target.path}`),
        readBlob(repoPath, `${target.to}:${target.path}`),
      ])
      return { old, new: current }
    }
    case 'staged': {
      const oldPath = target.oldPath ?? target.path
      const [old, current] = await Promise.all([
        readBlob(repoPath, `HEAD:${oldPath}`),
        readBlob(repoPath, `:${target.path}`),
      ])
      return { old, new: current }
    }
    case 'unstaged': {
      const [old, current] = await Promise.all([
        readBlob(repoPath, `:${target.path}`),
        readWorkingFile(repoPath, target.path),
      ])
      return { old, new: current }
    }
  }
}
