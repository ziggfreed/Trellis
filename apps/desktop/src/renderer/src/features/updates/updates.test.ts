import { describe, expect, it } from 'vitest'
import { describeStatus } from './updates'

describe('describeStatus', () => {
  it('explains each update state in plain words', () => {
    expect(describeStatus({ state: 'idle' })).toBe('')
    expect(describeStatus({ state: 'upToDate' })).toBe('Trellis is up to date.')
    expect(describeStatus({ state: 'downloading', version: '1.0.0', percent: 42 })).toBe(
      'Downloading Trellis 1.0.0… 42%',
    )
    expect(describeStatus({ state: 'ready', version: '1.0.0' })).toMatch(/Restart/)
    expect(describeStatus({ state: 'error', message: 'Offline' })).toBe('Offline')
  })
})
