import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('strips Electron and git prefixes', () => {
    const error = new Error(
      "Error invoking remote method 'repo:commit': GitError: git commit -F - failed: nothing to commit",
    )
    expect(errorMessage(error)).toBe('nothing to commit')
  })

  it('keeps multi-line git messages', () => {
    const error = new Error(
      "Error invoking remote method 'repo:push': Error: git push failed: ! [rejected]\nhint: pull first",
    )
    expect(errorMessage(error)).toBe('! [rejected]\nhint: pull first')
  })

  it('handles plain values', () => {
    expect(errorMessage('oops')).toBe('oops')
    expect(errorMessage(new Error(''))).toBe('Something went wrong.')
  })
})
