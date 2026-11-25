/**
 * Built-in AI: runs the tasks the UI asks for (suggest a commit message,
 * explain a commit, help with a conflict) against the user's own AI
 * service and key.
 *
 *   1. check AI is turned on (Settings > AI; it's off by default)
 *   2. gather the repository data the task needs (staged diff, git show...)
 *   3. build the prompt (prompts.ts) and stream the answer (providers.ts),
 *      passing each piece to the UI as it arrives
 *
 * The API key lives in the SecretStore and never leaves the main process.
 * Each request has an id so the UI can cancel it.
 */
import * as git from '@trellis/git'
import type { AiResult, AiTask, Settings } from '@shared/ipc'
import type { SecretStore } from '../services/secret-store'
import {
  MAX_INPUT_CHARS,
  cleanCommitMessage,
  commitMessagePrompt,
  explainCommitPrompt,
  parseConflictAnswer,
  resolveConflictPrompt,
  testPrompt,
  type Prompt,
} from './prompts'
import { streamAnswer } from './providers'

/** Where the API key is kept in the SecretStore. */
export const AI_KEY = 'ai.apiKey'

export class AiService {
  private running = new Map<string, AbortController>()

  constructor(
    private readonly getSettings: () => Settings,
    private readonly secrets: SecretStore,
  ) {}

  async run(requestId: string, task: AiTask, onText: (text: string) => void): Promise<AiResult> {
    const settings = this.getSettings().ai
    if (!settings.enabled)
      throw new Error('AI features are turned off. Turn them on in Settings > AI.')
    if (this.running.has(requestId)) throw new Error('That request is already running.')
    const controller = new AbortController()
    this.running.set(requestId, controller)
    try {
      const prompt = await this.buildPrompt(task)
      const text = await streamAnswer({
        settings,
        apiKey: (await this.secrets.get(AI_KEY)) ?? '',
        prompt,
        onText,
        signal: controller.signal,
      })
      if (task.kind === 'resolveConflict') {
        const { explanation, resolved } = parseConflictAnswer(text)
        return { text: explanation, truncated: false, resolved }
      }
      return {
        text: task.kind === 'commitMessage' ? cleanCommitMessage(text) : text,
        truncated: prompt.truncated,
      }
    } finally {
      this.running.delete(requestId)
    }
  }

  cancel(requestId: string): void {
    this.running.get(requestId)?.abort()
  }

  /** Stop everything (app quitting). */
  dispose(): void {
    for (const controller of this.running.values()) controller.abort()
  }

  private async buildPrompt(task: AiTask): Promise<Prompt> {
    switch (task.kind) {
      case 'commitMessage': {
        const diff = await git.runGit(['diff', '--cached', '--no-color', '--no-ext-diff'], {
          cwd: task.repo,
        })
        if (!diff.stdout.trim()) throw new Error('Stage some changes first.')
        const subjects = await git.runGit(['log', '-15', '--format=%s'], {
          cwd: task.repo,
          okExitCodes: [0, 128], // 128: no commits yet
        })
        return commitMessagePrompt(diff.stdout, subjects.stdout.split('\n').filter(Boolean))
      }
      case 'explainCommit': {
        const show = await git.runGit(
          ['show', '--no-color', '--no-ext-diff', '--stat', '--patch', '--format=fuller', task.sha],
          { cwd: task.repo },
        )
        return explainCommitPrompt(show.stdout)
      }
      case 'resolveConflict': {
        const file = await git.readWorkingFile(task.repo, task.path)
        if (file.kind !== 'text') throw new Error('Only text files can be resolved with AI.')
        if (file.text.length > MAX_INPUT_CHARS) {
          throw new Error('This file is too large to send to the AI. Resolve it by hand.')
        }
        const operation = await git.getRepoOperation(task.repo)
        const context = operation
          ? `The repository is in the middle of a ${operation}.${
              operation === 'rebase'
                ? ' In a rebase, the "current" (HEAD) side is the branch being rebased onto and the "incoming" side is the user’s own commit.'
                : ''
            }`
          : ''
        return resolveConflictPrompt(task.path, file.text, context)
      }
      case 'test':
        return testPrompt()
    }
  }
}
