import { describe, expect, it } from 'vitest'
import type { BisectState } from '@shared/ipc'
import { isImagePath } from '@/features/diff/image-diff'
import { bisectRole, stepsLeft } from './bisect'

const state: BisectState = {
  bad: 'b',
  good: ['g'],
  skipped: ['s'],
  current: 'c',
  remaining: 7,
  culprit: null,
}

describe('bisect helpers', () => {
  it('estimates the steps left', () => {
    expect(stepsLeft(1)).toBe(0)
    expect(stepsLeft(2)).toBe(1)
    expect(stepsLeft(7)).toBe(3)
    expect(stepsLeft(1000)).toBe(10)
  })

  it('gives each commit its role', () => {
    expect(bisectRole(state, 'b')).toBe('bad')
    expect(bisectRole(state, 'g')).toBe('good')
    expect(bisectRole(state, 's')).toBe('skipped')
    expect(bisectRole(state, 'c')).toBe('current')
    expect(bisectRole(state, 'x')).toBeNull()
    expect(bisectRole({ ...state, culprit: 'b' }, 'b')).toBe('culprit')
    expect(bisectRole(null, 'b')).toBeNull()
  })
})

describe('isImagePath', () => {
  it('recognises image files', () => {
    expect(isImagePath('assets/logo.PNG')).toBe(true)
    expect(isImagePath('icon.svg')).toBe(true)
    expect(isImagePath('notes.txt')).toBe(false)
  })
})
