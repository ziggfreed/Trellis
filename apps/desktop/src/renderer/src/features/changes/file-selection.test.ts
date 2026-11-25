import { describe, expect, it } from 'vitest'
import { NO_SELECTION, clickSelection, filesForRow, selectedIn } from './file-selection'

const files = ['a', 'b', 'c', 'd']
const plain = { toggle: false, range: false }
const toggle = { toggle: true, range: false }
const range = { toggle: false, range: true }

describe('file selection', () => {
  it('selects one file on a plain click', () => {
    const s = clickSelection(NO_SELECTION, 'unstaged', 'b', files, plain)
    expect(selectedIn(s, 'unstaged', files)).toEqual(['b'])
  })

  it('adds and removes files with Ctrl/Cmd+click', () => {
    let s = clickSelection(NO_SELECTION, 'unstaged', 'a', files, plain)
    s = clickSelection(s, 'unstaged', 'c', files, toggle)
    expect(selectedIn(s, 'unstaged', files)).toEqual(['a', 'c'])
    s = clickSelection(s, 'unstaged', 'a', files, toggle)
    expect(selectedIn(s, 'unstaged', files)).toEqual(['c'])
  })

  it('selects a range with Shift+click, in either direction', () => {
    let s = clickSelection(NO_SELECTION, 'staged', 'c', files, plain)
    s = clickSelection(s, 'staged', 'a', files, range)
    expect(selectedIn(s, 'staged', files)).toEqual(['a', 'b', 'c'])
    s = clickSelection(s, 'staged', 'd', files, range) // same anchor (c)
    expect(selectedIn(s, 'staged', files)).toEqual(['c', 'd'])
  })

  it('starts a new selection when clicking in the other list', () => {
    let s = clickSelection(NO_SELECTION, 'staged', 'a', files, plain)
    s = clickSelection(s, 'unstaged', 'b', files, toggle)
    expect(selectedIn(s, 'staged', files)).toEqual([])
    expect(selectedIn(s, 'unstaged', files)).toEqual(['b'])
  })

  it('drops files that left the list, and acts on the selection or just the row', () => {
    let s = clickSelection(NO_SELECTION, 'unstaged', 'a', files, plain)
    s = clickSelection(s, 'unstaged', 'b', files, toggle)
    expect(selectedIn(s, 'unstaged', ['b', 'c'])).toEqual(['b'])
    expect(filesForRow(s, 'unstaged', 'a', files)).toEqual(['a', 'b'])
    expect(filesForRow(s, 'unstaged', 'd', files)).toEqual(['d'])
  })
})
