import { afterEach, describe, expect, it } from 'vitest'
import { getRecentMessages, parseRecentMessages } from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

describe('recent commit messages', () => {
  it('parses messages newest first, dropping repeats and empty summaries', () => {
    const out = '\x1eA\x1fbody\n\x1f20\n\x1eB\x1f\x1f10\n\x1eA\x1fbody\n\x1f5\n\x1e\x1f\x1f1\n'
    expect(parseRecentMessages(out, 10)).toEqual([
      { summary: 'A', description: 'body', date: 20000 },
      { summary: 'B', description: '', date: 10000 },
    ])
    expect(parseRecentMessages(out, 1)).toHaveLength(1)
  })

  it('lists my recent messages from the history, not other people’s', async () => {
    repo = await createTempRepo()
    expect(await getRecentMessages(repo.path)).toEqual([]) // no commits yet

    await repo.write('a.txt', '1\n')
    await repo.git('add', '-A')
    await repo.git('commit', '-m', 'PROJ-1: first', '-m', 'Shared description')
    await repo.write('a.txt', '2\n')
    await repo.git('add', '-A')
    await repo.git('-c', 'user.email=someone.else@example.com', 'commit', '-m', 'Not mine')
    await repo.write('a.txt', '3\n')
    await repo.git('add', '-A')
    await repo.git('commit', '-m', 'PROJ-1: second', '-m', 'Shared description')

    const messages = await getRecentMessages(repo.path)
    expect(messages.map((m) => [m.summary, m.description])).toEqual([
      ['PROJ-1: second', 'Shared description'],
      ['PROJ-1: first', 'Shared description'],
    ])
  })
})
