/**
 * Checks for arguments received over IPC. They come from the UI, so we treat
 * them as untrusted input and check their shape before using them.
 * Each function throws a TypeError with a clear message if the check fails.
 */
import { isAbsolute, relative, resolve } from 'node:path'
import type { CheckoutTarget, DiffTarget, LogScope, PushRequest, RebasePlanItem } from '@shared/ipc'

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
  const target = value as Partial<{
    kind: string
    sha: string
    path: string
    oldPath: string
  }> | null
  if (!target || typeof target !== 'object') throw new TypeError('target must be an object')
  assertString(target.path, 'target.path')
  if (target.oldPath !== undefined) assertString(target.oldPath, 'target.oldPath')
  if (target.kind === 'commit') assertSha(target.sha, 'target.sha')
  else if (target.kind === 'range') {
    const range = target as { from?: unknown; to?: unknown }
    assertRefArg(range.from, 'target.from')
    assertRefArg(range.to, 'target.to')
  } else if (target.kind !== 'staged' && target.kind !== 'unstaged') {
    throw new TypeError('target.kind must be commit, range, staged or unstaged')
  }
}

export function assertScope(value: unknown): asserts value is LogScope {
  if (value !== 'all' && value !== 'local' && value !== 'head') {
    throw new TypeError('scope must be all, local or head')
  }
}

/**
 * A branch, tag, remote or other ref name. Must not start with "-", or git
 * would read it as an option (e.g. a branch called "--force").
 */
export function assertRefArg(value: unknown, name: string): asserts value is string {
  assertString(value, name)
  if (value.startsWith('-')) throw new TypeError(`${name} must not start with "-"`)
}

/** A stash position: a whole number, 0 or more. */
export function assertIndex(value: unknown, name: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(`${name} must be a whole number of 0 or more`)
  }
}

export function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): asserts value is T {
  if (!allowed.includes(value as T))
    throw new TypeError(`${name} must be one of ${allowed.join(', ')}`)
}

export function assertCheckoutTarget(value: unknown): asserts value is CheckoutTarget {
  const target = value as Partial<{
    kind: string
    name: string
    localName: string
    sha: string
  }> | null
  if (!target || typeof target !== 'object') throw new TypeError('target must be an object')
  if (target.kind === 'branch') assertRefArg(target.name, 'target.name')
  else if (target.kind === 'remote-branch') {
    assertRefArg(target.name, 'target.name')
    assertRefArg(target.localName, 'target.localName')
  } else if (target.kind === 'commit') assertSha(target.sha, 'target.sha')
  else throw new TypeError('target.kind must be branch, remote-branch or commit')
}

export function assertPushRequest(value: unknown): asserts value is PushRequest {
  const request = value as Partial<PushRequest> | null
  if (!request || typeof request !== 'object') throw new TypeError('request must be an object')
  assertRefArg(request.remote, 'request.remote')
  assertRefArg(request.branch, 'request.branch')
  if (request.remoteBranch !== undefined) assertRefArg(request.remoteBranch, 'request.remoteBranch')
}

/** A rebase base: a commit hash, or 'root' to start from the very first commit. */
export function assertRebaseBase(value: unknown): asserts value is string {
  if (value !== 'root') assertSha(value, 'base')
}

const REBASE_ACTIONS = ['pick', 'reword', 'squash', 'fixup', 'drop'] as const

export function assertRebasePlan(value: unknown): asserts value is RebasePlanItem[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new TypeError('plan must be a non-empty array')
  for (const item of value as Partial<RebasePlanItem>[]) {
    assertSha(item?.sha, 'plan item sha')
    assertOneOf(item.action, REBASE_ACTIONS, 'plan item action')
    if (item.message !== undefined && typeof item.message !== 'string') {
      throw new TypeError('plan item message must be a string')
    }
  }
}

/**
 * A file path relative to the repository that stays inside it, so the UI
 * can never read or write files elsewhere on disk (e.g. "../../secret").
 */
export function assertFileInRepo(repoPath: string, file: unknown): asserts file is string {
  assertString(file, 'file')
  const rel = relative(repoPath, resolve(repoPath, file))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new TypeError('file must be inside the repository')
  }
}
