/**
 * Running AI tasks from the UI. Main does the work (see src/main/ai); this
 * file starts a task, passes the streamed pieces of the answer to a
 * callback, and lets the caller cancel it.
 *
 *   const task = startAiTask({ kind: 'explainCommit', repo, sha }, (text) => ...)
 *   const { text, truncated } = await task.result
 *   task.cancel()
 */
import type { AiResult, AiTask } from '@shared/ipc'
import { api } from '@/lib/api'
import { useSettingsStore } from '@/features/settings/settings-store'

export interface RunningAiTask {
  result: Promise<AiResult>
  cancel: () => void
}

let nextId = 1

export function startAiTask(task: AiTask, onText?: (text: string) => void): RunningAiTask {
  const requestId = `ai-${Date.now()}-${nextId++}`
  const stop = onText
    ? api.on('ai:chunk', (chunk) => {
        if (chunk.requestId === requestId) onText(chunk.text)
      })
    : () => {}
  const result = api.invoke('ai:run', requestId, task).finally(stop)
  return { result, cancel: () => void api.invoke('ai:cancel', requestId) }
}

/** Whether the user has turned AI features on (Settings > AI). */
export function useAiEnabled(): boolean {
  return useSettingsStore((s) => s.settings.ai.enabled)
}
