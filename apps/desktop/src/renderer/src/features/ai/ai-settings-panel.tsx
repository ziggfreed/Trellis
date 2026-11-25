/**
 * Settings > AI: turn AI features on, choose the service and model, save
 * the API key, and test the connection.
 *
 * The key is sent to main once and stored encrypted (secret-store.ts); the
 * UI never reads it back, it only learns whether one is saved.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { AiProvider, AiSettings } from '@shared/ipc'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/features/settings/settings-store'
import { Field, Select } from '@/features/settings/fields'
import { startAiTask } from './ai-client'

/** Shown as suggestions; any model name the service accepts can be typed. */
const MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  openai: [],
}
const MODEL_PLACEHOLDER: Record<AiProvider, string> = {
  anthropic: 'claude-opus-5-5 (default)',
  openai: 'Required, e.g. the model name your service lists',
}
const URL_PLACEHOLDER: Record<AiProvider, string> = {
  anthropic: 'https://api.anthropic.com (default)',
  openai: 'https://api.openai.com/v1 (default), or e.g. http://localhost:11434/v1 for Ollama',
}

const keyStatusKey = ['ai', 'keyStatus'] as const

export function AiSettingsPanel() {
  const ai = useSettingsStore((s) => s.settings.ai)
  const update = useSettingsStore((s) => s.update)
  const set = (patch: Partial<AiSettings>) => update({ ai: { ...ai, ...patch } })

  return (
    <div className="space-y-4" data-testid="ai-settings">
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            aria-describedby="ai-enabled-help"
            checked={ai.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          Turn on AI features
        </label>
        <p id="ai-enabled-help" className="pl-6 text-xs text-muted-foreground">
          Suggest commit messages, explain commits and help with merge conflicts. When you use them,
          the changes involved are sent to the service below, with your own API key. Nothing is sent
          until you click an AI button.
        </p>
      </div>

      <fieldset disabled={!ai.enabled} className="space-y-4 disabled:opacity-50">
        <Field id="ai-provider" label="Service">
          <Select
            id="ai-provider"
            value={ai.provider}
            onChange={(provider) => set({ provider: provider as AiProvider, model: '' })}
            options={[
              { value: 'anthropic', label: 'Anthropic (Claude)' },
              { value: 'openai', label: 'OpenAI-compatible (OpenAI, OpenRouter, Ollama…)' },
            ]}
          />
        </Field>
        <Field id="ai-model" label="Model">
          <input
            id="ai-model"
            list="ai-model-suggestions"
            value={ai.model}
            placeholder={MODEL_PLACEHOLDER[ai.provider]}
            onChange={(e) => set({ model: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
          <datalist id="ai-model-suggestions">
            {MODEL_SUGGESTIONS[ai.provider].map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </Field>
        <Field
          id="ai-url"
          label="API address"
          help="Leave empty unless you use a proxy, a different region or a local model."
        >
          <input
            id="ai-url"
            value={ai.baseUrl}
            placeholder={URL_PLACEHOLDER[ai.provider]}
            onChange={(e) => set({ baseUrl: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
        </Field>
        <ApiKeyField provider={ai.provider} />
        <TestConnection />
      </fieldset>
    </div>
  )
}

function ApiKeyField({ provider }: { provider: AiProvider }) {
  const queryClient = useQueryClient()
  const status = useQuery({ queryKey: keyStatusKey, queryFn: () => api.invoke('ai:keyStatus') })
  const [key, setKey] = useState('')

  const save = async (value: string | null) => {
    try {
      await api.invoke('ai:setKey', value)
      setKey('')
      toast.success(value ? 'API key saved.' : 'API key removed.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      void queryClient.invalidateQueries({ queryKey: keyStatusKey })
    }
  }

  const help =
    provider === 'anthropic'
      ? 'Create a key in the Anthropic Console (console.anthropic.com). '
      : 'Local services such as Ollama don’t need one. '
  return (
    <Field
      id="ai-key"
      label="API key"
      help={`${help}It is stored encrypted on this computer and only sent to the service above.${
        status.data?.weakStorage
          ? ' This system has no keyring (e.g. GNOME Keyring), so the encryption is weak.'
          : ''
      }`}
    >
      <div className="flex gap-2">
        <input
          id="ai-key"
          type="password"
          autoComplete="off"
          value={key}
          placeholder={status.data?.hasKey ? '•••••••• (saved)' : 'Paste your key'}
          onChange={(e) => setKey(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        />
        <Button size="sm" disabled={!key.trim()} onClick={() => void save(key)}>
          Save
        </Button>
        {status.data?.hasKey && (
          <Button size="sm" variant="outline" onClick={() => void save(null)}>
            Remove
          </Button>
        )}
      </div>
    </Field>
  )
}

function TestConnection() {
  const [state, setState] = useState<{ kind: 'idle' | 'running' | 'ok' | 'error'; text: string }>({
    kind: 'idle',
    text: '',
  })
  const test = async () => {
    setState({ kind: 'running', text: '' })
    try {
      const { text } = await startAiTask({ kind: 'test' }).result
      setState({ kind: 'ok', text: text.trim() || 'Connected.' })
    } catch (error) {
      setState({ kind: 'error', text: errorMessage(error) })
    }
  }
  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        variant="outline"
        disabled={state.kind === 'running'}
        onClick={() => void test()}
      >
        {state.kind === 'running' ? 'Testing…' : 'Test connection'}
      </Button>
      <span
        role="status"
        className={
          state.kind === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
        }
      >
        {state.text}
      </span>
    </div>
  )
}
