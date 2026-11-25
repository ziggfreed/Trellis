/**
 * Sending a prompt to the user's chosen AI service and streaming the
 * answer back, piece by piece, through `onText`.
 *
 *   anthropic  Claude, through the official Anthropic SDK.
 *   openai     Any OpenAI-style chat completions API: OpenAI itself,
 *              OpenRouter, or a local model in Ollama / LM Studio. Called
 *              with fetch, since the API is a single streaming endpoint.
 *
 * Errors are turned into plain sentences for the UI (wrong key, rate
 * limited, can't connect...).
 */
import Anthropic from '@anthropic-ai/sdk'
import type { AiSettings } from '@shared/ipc'
import type { Prompt } from './prompts'
import { createSseParser, openAiDeltaText } from './sse'

/** Used when the model setting is empty. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'
export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

export interface StreamRequest {
  settings: AiSettings
  /** Empty for services that don't need one (e.g. a local model). */
  apiKey: string
  prompt: Prompt
  onText: (text: string) => void
  signal: AbortSignal
}

/** Send the prompt and resolve with the whole answer once it has finished. */
export async function streamAnswer(request: StreamRequest): Promise<string> {
  return request.settings.provider === 'anthropic'
    ? streamAnthropic(request)
    : streamOpenAi(request)
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

/**
 * Models that accept `output_config.effort` (older ones reject it). The
 * setting is free text, so match by name.
 */
function supportsEffort(model: string): boolean {
  return /^claude-(fable|mythos|opus|sonnet|haiku)-5|^claude-opus-4-[5-8]|^claude-sonnet-4-6/.test(
    model,
  )
}

/**
 * Models that support server-side fallbacks: if the model declines a
 * request (its safety checks can be over-cautious about, say, security
 * code), Anthropic retries it on another model instead of failing.
 */
function supportsFallback(model: string): boolean {
  return /^claude-(fable-5-[12]|opus-5-5|opus-5|sonnet-5-5)$/.test(model)
}

async function streamAnthropic({ settings, apiKey, prompt, onText, signal }: StreamRequest) {
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings > AI.')
  const model = settings.model.trim() || DEFAULT_ANTHROPIC_MODEL
  // Pass everything explicitly: otherwise the SDK would also read
  // ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN from the environment, which a
  // desktop app's users wouldn't expect.
  const client = new Anthropic({
    apiKey,
    authToken: null,
    baseURL: settings.baseUrl.trim() || DEFAULT_ANTHROPIC_BASE_URL,
  })
  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: prompt.maxTokens,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        ...(supportsEffort(model) ? { output_config: { effort: prompt.effort } } : {}),
        ...(supportsFallback(model)
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      },
      { signal },
    )
    let text = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text
        onText(event.delta.text)
      }
    }
    const message = await stream.finalMessage()
    if (message.stop_reason === 'refusal') {
      throw new Error('The model declined to answer this request.')
    }
    return text
  } catch (error) {
    throw new Error(anthropicErrorMessage(error), { cause: error })
  }
}

function anthropicErrorMessage(error: unknown): string {
  if (error instanceof Anthropic.APIUserAbortError) return 'Cancelled.'
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Anthropic rejected the API key. Check it in Settings > AI.'
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'This API key isn’t allowed to use that model.'
  }
  if (error instanceof Anthropic.NotFoundError) {
    return 'Anthropic doesn’t know that model. Check the model name in Settings > AI.'
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Anthropic is limiting requests from this key. Wait a moment and try again.'
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Couldn’t reach Anthropic. Check your internet connection.'
  }
  if (error instanceof Anthropic.APIError) return `Anthropic error: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

// ---------------------------------------------------------------------------
// OpenAI-style
// ---------------------------------------------------------------------------

async function streamOpenAi({ settings, apiKey, prompt, onText, signal }: StreamRequest) {
  const model = settings.model.trim()
  if (!model)
    throw new Error('Enter a model name in Settings > AI (e.g. the one your service lists).')
  const base = (settings.baseUrl.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '')
  let response: Response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      }),
    })
  } catch (error) {
    if (signal.aborted) throw new Error('Cancelled.', { cause: error })
    throw new Error(`Couldn’t reach ${base}. Check the address in Settings > AI.`, {
      cause: error,
    })
  }
  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => '')).slice(0, 300)
    throw new Error(
      response.status === 401
        ? 'The service rejected the API key. Check it in Settings > AI.'
        : `The AI service answered ${response.status}${detail ? `: ${detail}` : '.'}`,
    )
  }

  let text = ''
  const feed = createSseParser((data) => {
    const piece = openAiDeltaText(data)
    if (piece) {
      text += piece
      onText(piece)
    }
  })
  const decoder = new TextDecoder()
  try {
    for await (const chunk of response.body) feed(decoder.decode(chunk, { stream: true }))
  } catch (error) {
    if (signal.aborted) throw new Error('Cancelled.', { cause: error })
    throw error
  }
  return text
}
