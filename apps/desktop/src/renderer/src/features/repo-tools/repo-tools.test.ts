import { describe, expect, it } from 'vitest'
import type { ReflogEntry } from '@shared/ipc'
import { ignoreChoices } from './ignore-actions'
import { describeEntry } from './reflog-dialog'
import { describeSignature } from './signature'

const entry = (kind: string, description: string): ReflogEntry => ({
  sha: 'abc',
  selector: 'HEAD@{0}',
  kind,
  description,
  date: 0,
  subject: 'Subject',
})

describe('ignoreChoices', () => {
  it('offers the extension and folder only when they exist', () => {
    expect(ignoreChoices('src/app.log').map((c) => c.label)).toEqual([
      'Ignore this file',
      'Ignore all *.log files',
      'Ignore the folder src/',
    ])
    expect(ignoreChoices('.env').map((c) => c.kind)).toEqual(['file'])
  })
})

describe('describeEntry', () => {
  it('turns reflog actions into short sentences', () => {
    expect(describeEntry(entry('commit', 'Add x'))).toBe('Committed')
    expect(describeEntry(entry('commit (amend)', 'Add x'))).toBe('Committed (amend)')
    expect(describeEntry(entry('checkout', 'moving from main to topic'))).toBe(
      'Switched from main to topic',
    )
    expect(describeEntry(entry('reset', 'moving to HEAD~1'))).toBe('Reset to HEAD~1')
    expect(describeEntry(entry('rebase (finish)', 'returning to refs/heads/x'))).toBe(
      'Rebase (finish): returning to refs/heads/x',
    )
  })
})

describe('describeSignature', () => {
  it('names the signer and explains problems', () => {
    expect(describeSignature({ status: 'good', signer: 'Ada', key: 'K' }).label).toBe(
      'Verified: Ada',
    )
    expect(describeSignature({ status: 'unknown', signer: null, key: 'K' }).label).toBe(
      'Signed with key K (can’t check)',
    )
    expect(describeSignature({ status: 'bad', signer: null, key: null }).detail).toMatch(
      /changed after signing/,
    )
  })
})
