/**
 * Checks for arguments received over IPC. They come from the UI, so we treat
 * them as untrusted input and check their shape before using them.
 * Each function throws a TypeError with a clear message if the check fails.
 */
import type { DiffTarget, LogScope } from '@shared/ipc'

export function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

export function assertStringArray(value: unknown, name: string): asserts value is string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new TypeError(`${name} must be an array of strings`)
  }
}

/** A full or abbreviated commit hash (hex only, so it can't be a git option). */
export function assertSha(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{4,64}$/i.test(value)) {
    throw new TypeError(`${name} must be a commit hash`)
  }
}

export function assertPage(value: unknown): asserts value is { skip: number; limit: number } {
  const page = value as { skip?: unknown; limit?: unknown } | null
  const isCount = (n: unknown, max: number) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max
  if (!page || !isCount(page.skip, Number.MAX_SAFE_INTEGER) || !isCount(page.limit, 10_000)) {
    throw new TypeError('page must be { skip, limit } with whole numbers (limit at most 10000)')
  }
}

export function assertDiffTarget(value: unknown): asserts value is DiffTarget {
  const target = value as Partial<DiffTarget & { sha: string; oldPath: string }> | null
  if (!target || typeof target !== 'object') throw new TypeError('target must be an object')
  assertString(target.path, 'target.path')
  if (target.oldPath !== undefined) assertString(target.oldPath, 'target.oldPath')
  if (target.kind === 'commit') assertSha(target.sha, 'target.sha')
  else if (target.kind !== 'staged' && target.kind !== 'unstaged') {
    throw new TypeError('target.kind must be commit, staged or unstaged')
  }
}

export function assertScope(value: unknown): asserts value is LogScope {
  if (value !== 'all' && value !== 'local' && value !== 'head') {
    throw new TypeError('scope must be all, local or head')
  }
}
