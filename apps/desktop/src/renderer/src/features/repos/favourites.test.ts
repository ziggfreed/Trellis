import { describe, expect, it } from 'vitest'
import { isFavourite, toggleFavourite } from './favourites'

const a = { path: '/a', name: 'a' }
const b = { path: '/b', name: 'b' }

describe('favourites', () => {
  it('stars and unstars repositories', () => {
    const starred = toggleFavourite(toggleFavourite([], a), b)
    expect(starred).toEqual([a, b])
    expect(isFavourite(starred, '/b')).toBe(true)
    expect(toggleFavourite(starred, a)).toEqual([b])
  })
})
