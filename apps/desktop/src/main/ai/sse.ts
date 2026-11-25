/**
 * A small parser for Server-Sent Events, the format OpenAI-style APIs use
 * to stream answers:
 *
 *   data: {"choices":[{"delta":{"content":"Hel"}}]}
 *
 *   data: {"choices":[{"delta":{"content":"lo"}}]}
 *
 *   data: [DONE]
 *
 * Network chunks can end anywhere (even mid-line), so text is buffered
 * until a full event (ended by a blank line) has arrived.
 */

/** Returns a function to feed text into; `onData` gets each event's data. */
export function createSseParser(onData: (data: string) => void): (chunk: string) => void {
  let buffer = ''
  return (chunk) => {
    buffer += chunk.replace(/\r\n?/g, '\n')
    let end: number
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      // An event's data can span several "data:" lines, joined by newlines.
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
      if (data.length) onData(data.join('\n'))
    }
  }
}

/** The text in one OpenAI-style streaming event, or '' if it has none. */
export function openAiDeltaText(data: string): string {
  if (data === '[DONE]') return ''
  try {
    const event = JSON.parse(data) as {
      choices?: { delta?: { content?: string | null } }[]
      error?: { message?: string }
    }
    if (event.error) throw new Error(event.error.message ?? 'The AI service reported an error.')
    return event.choices?.[0]?.delta?.content ?? ''
  } catch (error) {
    if (error instanceof SyntaxError) return '' // e.g. a keep-alive comment
    throw error
  }
}
