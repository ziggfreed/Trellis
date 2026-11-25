import { afterEach, describe, expect, it } from 'vitest'
import { getCommitStats, parseCommitStats } from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

describe('commit stats', () => {
  it('parses numstat output, counting binary files without lines', () => {
    expect(parseCommitStats('\0abc\n\n3\t1\ta.txt\n-\t-\timg.png\n\0def\n')).toEqual({
      abc: { files: 2, insertions: 3, deletions: 1 },
      def: { files: 0, insertions: 0, deletions: 0 },
    })
  })

  it('counts files and lines for commits, and merges against their first parent', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'one\ntwo\n')
    const first = await repo.commit('first')
    await repo.write('a.txt', 'one\n2\n')
    await repo.write('b.txt', 'b\n')
    const second = await repo.commit('second')
    await repo.git('switch', '-c', 'side', first)
    await repo.write('c.txt', 'c\nc\n')
    await repo.commit('side')
    await repo.git('switch', 'main')
    await repo.git('merge', '--no-ff', '-m', 'merge side', 'side')
    const merge = (await repo.git('rev-parse', 'HEAD')).trim()

    const stats = await getCommitStats(repo.path, [second, first, merge])
    expect(stats[first]).toEqual({ files: 1, insertions: 2, deletions: 0 })
    expect(stats[second]).toEqual({ files: 2, insertions: 2, deletions: 1 })
    expect(stats[merge]).toEqual({ files: 1, insertions: 2, deletions: 0 })
  })
})
