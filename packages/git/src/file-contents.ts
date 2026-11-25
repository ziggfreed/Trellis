/**
 * Loads the "before" and "after" versions of a file so the UI can show a diff.
 *
 * Versions can come from three places:
 *   - a commit:          `git cat-file blob <sha>:<path>`
 *   - the index (staged): `git cat-file blob :<path>`
 *   - the working tree:  read straight from disk
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit, runGitBuffer } from './run-git'
import type { DiffTarget, FileContent, FileDiffContents, ImageDiff, ImageVersion } from './types'

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

/** Where one side of a diff comes from: a blob spec, or a file on disk. */
type Source = { blob: string } | { working: string }

/** The old and new sources for a diff target. */
function diffSources(target: DiffTarget): [Source, Source] {
  switch (target.kind) {
    case 'commit':
      // `<sha>^` is the first parent. For the first commit it doesn't exist,
      // so the old side is reported as missing, which is what we want.
      return [
        { blob: `${target.sha}^:${target.oldPath ?? target.path}` },
        { blob: `${target.sha}:${target.path}` },
      ]
    case 'range':
      return [
        { blob: `${target.from}:${target.oldPath ?? target.path}` },
        { blob: `${target.to}:${target.path}` },
      ]
    case 'staged':
      return [{ blob: `HEAD:${target.oldPath ?? target.path}` }, { blob: `:${target.path}` }]
    case 'unstaged':
      return [{ blob: `:${target.path}` }, { working: target.path }]
  }
}

/** Load the old and new versions of a file for the given diff target. */
export async function getFileDiffContents(
  repoPath: string,
  target: DiffTarget,
): Promise<FileDiffContents> {
  const read = (source: Source) =>
    'blob' in source ? readBlob(repoPath, source.blob) : readWorkingFile(repoPath, source.working)
  const [old, current] = await Promise.all(diffSources(target).map(read))
  return { old: old!, new: current! }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Images bigger than this aren't loaded for the image diff. */
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024

/** Read one side's raw bytes for the image diff. */
async function readImage(repoPath: string, source: Source): Promise<ImageVersion> {
  if ('working' in source) {
    const fullPath = join(repoPath, source.working)
    try {
      const info = await stat(fullPath)
      if (!info.isFile()) return { kind: 'missing' }
      if (info.size > MAX_IMAGE_SIZE) return { kind: 'too-large', size: info.size }
      const data = await readFile(fullPath)
      return { kind: 'image', base64: data.toString('base64'), size: data.length }
    } catch {
      return { kind: 'missing' }
    }
  }
  const size = await runGit(['cat-file', '-s', source.blob], {
    cwd: repoPath,
    okExitCodes: [0, 128],
  })
  if (size.exitCode !== 0) return { kind: 'missing' }
  const bytes = Number(size.stdout.trim())
  if (bytes > MAX_IMAGE_SIZE) return { kind: 'too-large', size: bytes }
  const blob = await runGitBuffer(['cat-file', 'blob', source.blob], {
    cwd: repoPath,
    okExitCodes: [0, 128],
  })
  return blob.exitCode === 0
    ? { kind: 'image', base64: blob.stdout.toString('base64'), size: blob.stdout.length }
    : { kind: 'missing' }
}

/**
 * Both versions of an image for the image diff, as base64 (the UI shows
 * them as data: URLs). Larger limit than text diffs, since images are big.
 */
export async function getImageDiff(repoPath: string, target: DiffTarget): Promise<ImageDiff> {
  const [old, current] = await Promise.all(
    diffSources(target).map((source) => readImage(repoPath, source)),
  )
  return { old: old!, new: current! }
}

/** Overwrite a file in the working tree (editing a file from the diff view). */
export async function writeWorkingFile(
  repoPath: string,
  path: string,
  content: string,
): Promise<void> {
  await writeFile(join(repoPath, path), content)
}
