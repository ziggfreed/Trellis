/**
 * IPC handlers for submodules, Git LFS and saving files edited in the diff
 * view. Spread into the full handler list in handlers.ts.
 *
 * Network commands (updating or adding submodules) report progress and can
 * be cancelled, like fetch and push (see remoteOperation).
 */
import * as git from '@trellis/git'
import type { IpcArgs, IpcResult } from '@shared/ipc'
import { runExclusive } from '../services/repo-queue'
import { remoteOperation, type ProgressSender } from './write-handlers'
import { assertFileInRepo, assertString, assertStringArray } from './validate'

type ContentChannel =
  | 'repo:getSubmodules'
  | 'repo:updateSubmodules'
  | 'repo:addSubmodule'
  | 'repo:syncSubmodules'
  | 'repo:getLfs'
  | 'repo:lfsTrack'
  | 'repo:lfsUntrack'
  | 'repo:getLfsLocks'
  | 'repo:lfsLock'
  | 'repo:lfsUnlock'
  | 'repo:writeWorkingFile'

type ContentHandlers = {
  [C in ContentChannel]: (...args: IpcArgs<C>) => Promise<IpcResult<C>> | IpcResult<C>
}

/** An LFS pattern like "*.psd" or "assets/**": text, not an option. */
function assertPattern(value: unknown): asserts value is string {
  assertString(value, 'pattern')
  if (!value.trim() || value.trim().startsWith('-') || /[\r\n]/.test(value)) {
    throw new TypeError('pattern is not valid')
  }
}

export function createContentHandlers(sendProgress: ProgressSender): ContentHandlers {
  return {
    // --- Submodules ------------------------------------------------------------
    'repo:getSubmodules': (path) => {
      assertString(path, 'path')
      return git.getSubmodules(path)
    },
    'repo:updateSubmodules': (operationId, path, paths) => {
      assertStringArray(paths, 'paths')
      for (const p of paths) assertFileInRepo(path, p)
      return remoteOperation(operationId, path, sendProgress, (o) =>
        git.updateSubmodules(path, paths, o),
      )
    },
    'repo:addSubmodule': (operationId, path, url, folder) => {
      assertString(url, 'url')
      if (!url.trim() || url.trim().startsWith('-')) throw new TypeError('url is not valid')
      assertFileInRepo(path, folder)
      return remoteOperation(operationId, path, sendProgress, (o) =>
        git.addSubmodule(path, url.trim(), folder, o),
      )
    },
    'repo:syncSubmodules': (path) => {
      assertString(path, 'path')
      return runExclusive(path, () => git.syncSubmodules(path))
    },

    // --- Git LFS ---------------------------------------------------------------
    'repo:getLfs': async (path) => {
      assertString(path, 'path')
      const [version, patterns] = await Promise.all([
        git.getLfsVersion(path),
        git.getLfsPatterns(path),
      ])
      return { version, patterns }
    },
    'repo:lfsTrack': (path, pattern) => {
      assertString(path, 'path')
      assertPattern(pattern)
      return runExclusive(path, () => git.lfsTrack(path, pattern.trim()))
    },
    'repo:lfsUntrack': (path, pattern) => {
      assertString(path, 'path')
      assertPattern(pattern)
      return runExclusive(path, () => git.lfsUntrack(path, pattern.trim()))
    },
    'repo:getLfsLocks': (path) => {
      assertString(path, 'path')
      return git.getLfsLocks(path)
    },
    'repo:lfsLock': (path, file) => {
      assertString(path, 'path')
      assertFileInRepo(path, file)
      return runExclusive(path, () => git.lfsLock(path, file))
    },
    'repo:lfsUnlock': (path, file, force) => {
      assertString(path, 'path')
      assertFileInRepo(path, file)
      return runExclusive(path, () => git.lfsUnlock(path, file, force === true))
    },

    // --- Editing ---------------------------------------------------------------
    'repo:writeWorkingFile': (path, file, content) => {
      assertString(path, 'path')
      assertFileInRepo(path, file)
      if (typeof content !== 'string') throw new TypeError('content must be a string')
      return runExclusive(path, () => git.writeWorkingFile(path, file, content))
    },
  }
}
