/**
 * The `ai:*` IPC channels (see src/shared/ipc.ts), used by the UI's AI
 * buttons and by Settings > AI. Arguments come from the renderer, so they
 * are checked before use.
 */
import { BrowserWindow } from 'electron'
import type { AiTask, IpcArgs, IpcChannel, IpcResult } from '@shared/ipc'
import type { SettingsStore } from '../services/settings-store'
import type { SecretStore } from '../services/secret-store'
import { assertFileInRepo, assertSha, assertString } from '../ipc/validate'
import { AI_KEY, AiService } from './ai-service'

type AiChannel = Extract<IpcChannel, `ai:${string}`>
export type AiHandlers = {
  [C in AiChannel]: (...args: IpcArgs<C>) => Promise<IpcResult<C>> | IpcResult<C>
}

/** Throw unless `task` is a well-formed AiTask. */
function assertTask(task: unknown): asserts task is AiTask {
  if (typeof task !== 'object' || task === null) throw new TypeError('task must be an object')
  const t = task as Record<string, unknown>
  if (t.kind === 'test') return
  assertString(t.repo, 'task.repo')
  if (t.kind === 'commitMessage') return
  if (t.kind === 'explainCommit') return assertSha(t.sha, 'task.sha')
  if (t.kind === 'resolveConflict') return assertFileInRepo(t.repo, t.path)
  throw new TypeError('Unknown AI task')
}

export function createAiService(settings: SettingsStore, secrets: SecretStore) {
  const service = new AiService(() => settings.get(), secrets)

  const handlers: AiHandlers = {
    'ai:keyStatus': async () => ({
      hasKey: secrets.has(AI_KEY),
      secureStorage: await secrets.isAvailable(),
      weakStorage: secrets.isWeak(),
    }),

    'ai:setKey': async (key) => {
      if (key === null) return secrets.delete(AI_KEY)
      assertString(key, 'key')
      if (key.trim() === '') return secrets.delete(AI_KEY)
      await secrets.set(AI_KEY, key.trim())
    },

    'ai:run': (requestId, task) => {
      assertString(requestId, 'requestId')
      assertTask(task)
      return service.run(requestId, task, (text) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send('ai:chunk', { requestId, text })
        }
      })
    },

    'ai:cancel': (requestId) => {
      assertString(requestId, 'requestId')
      service.cancel(requestId)
    },
  }

  return { handlers, dispose: () => service.dispose() }
}
