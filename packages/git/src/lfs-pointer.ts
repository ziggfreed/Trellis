/**
 * Recognising Git LFS pointer files. Pure (no git, no Node APIs), so the UI
 * can use it too, via "@trellis/git/lfs-pointer".
 */
import type { LfsPointer } from './types'

/**
 * If `text` is an LFS pointer file (what the repository stores instead of
 * the real file), its object id and the real file's size; otherwise null.
 *   version https://git-lfs.github.com/spec/v1
 *   oid sha256:4d7a...
 *   size 12345
 */
export function parseLfsPointer(text: string): LfsPointer | null {
  if (text.length > 1024 || !text.startsWith('version https://git-lfs.github.com/spec/')) {
    return null
  }
  const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(text)?.[1]
  const size = /^size (\d+)$/m.exec(text)?.[1]
  return oid && size ? { oid, size: Number(size) } : null
}
