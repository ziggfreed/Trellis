import { describe, expect, it } from 'vitest'
import { createSseParser, openAiDeltaText } from './sse'

describe('createSseParser', () => {
  it('handles events split across chunks', () => {
    const events: string[] = []
    const feed = createSseParser((data) => events.push(data))
    feed('data: {"a":')
    feed('1}\n\nda')
    feed('ta: [DONE]\r\n\r\n')
    expect(events).toEqual(['{"a":1}', '[DONE]'])
  })

  it('joins multi-line data and ignores comments', () => {
    const events: string[] = []
    const feed = createSseParser((data) => events.push(data))
    feed(': keep-alive\n\ndata: one\ndata: two\n\n')
    expect(events).toEqual(['one\ntwo'])
  })
})

describe('openAiDeltaText', () => {
  it('reads the streamed text', () => {
    expect(openAiDeltaText('{"choices":[{"delta":{"content":"Hi"}}]}')).toBe('Hi')
    expect(openAiDeltaText('{"choices":[{"delta":{}}]}')).toBe('')
    expect(openAiDeltaText('[DONE]')).toBe('')
  })

  it('throws errors the service sends mid-stream', () => {
    expect(() => openAiDeltaText('{"error":{"message":"Quota exceeded"}}')).toThrow('Quota')
  })
})
