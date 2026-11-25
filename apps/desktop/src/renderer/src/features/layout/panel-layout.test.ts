import { describe, expect, it } from 'vitest'
import { usableLayout } from './panel-layout'

describe('usableLayout', () => {
  it('accepts a layout for exactly these panels that adds up to 100%', () => {
    expect(usableLayout({ a: 25, b: 75 }, ['a', 'b'])).toEqual({ a: 25, b: 75 })
    expect(usableLayout({ a: 33.3, b: 33.3, c: 33.4 }, ['a', 'b', 'c'])).toBeDefined()
  })

  it('ignores missing, stale or broken layouts', () => {
    expect(usableLayout(undefined, ['a', 'b'])).toBeUndefined()
    expect(usableLayout({ a: 50, old: 50 }, ['a', 'b'])).toBeUndefined()
    expect(usableLayout({ a: 50 }, ['a', 'b'])).toBeUndefined()
    expect(usableLayout({ a: 50, b: 'x' }, ['a', 'b'])).toBeUndefined()
    expect(usableLayout({ a: 10, b: 10 }, ['a', 'b'])).toBeUndefined()
  })
})
