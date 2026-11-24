/**
 * One LogReader per open repository, so scrolling through history reuses a
 * single streaming `git log` instead of starting a new one for every page.
 *
 * A request for the first page (skip = 0) always starts a fresh reader:
 * that's what the UI asks for when history may have changed (after a
 * commit, fetch, checkout, or when the branch filter changes).
 */
import { LogReader, type LogPageResult, type LogScope } from '@trellis/git'

const readers = new Map<string, LogReader>()

export function getLogPage(
  repoPath: string,
  scope: LogScope,
  skip: number,
  limit: number,
): Promise<LogPageResult> {
  let reader = readers.get(repoPath)
  if (!reader || skip === 0 || reader.scope !== scope) {
    reader?.dispose()
    reader = new LogReader(repoPath, scope)
    readers.set(repoPath, reader)
  }
  return reader.getPage(skip, limit)
}

/** Stop readers for repositories that are no longer open. */
export function keepLogReaders(repoPaths: string[]): void {
  const keep = new Set(repoPaths)
  for (const [path, reader] of readers) {
    if (!keep.has(path)) {
      reader.dispose()
      readers.delete(path)
    }
  }
}
