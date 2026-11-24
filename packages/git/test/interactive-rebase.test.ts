import { afterEach, describe, expect, it } from 'vitest'
import {
  abortOperation,
  buildRebaseTodo,
  getRebaseCommits,
  getStatus,
  interactiveRebase,
  validateRebasePlan,
  type RebasePlanItem,
} from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

/** A repo with commits base, A, B, C, each adding its own file. Returns the base sha. */
async function setup() {
  repo = await createTempRepo()
  await repo.write('base.txt', 'base\n')
  const base = await repo.commit('base')
  for (const name of ['A', 'B', 'C']) {
    await repo.write(`${name}.txt`, `${name}\n`)
    await repo.commit(`commit ${name}`)
  }
  return { r: repo, base }
}
const messages = async (r: TempRepo) => (await r.git('log', '--format=%B%x00')).split('\0').map((m) => m.trim()).filter(Boolean)
const files = async (r: TempRepo) => (await r.git('ls-files')).trim().split('\n')

async function plan(r: TempRepo, base: string, actions: Record<string, Partial<RebasePlanItem>>, order?: string[]) {
  const { commits } = await getRebaseCommits(r.path, base)
  const bySubject = new Map(commits.map((c) => [c.subject, c]))
  const subjects = order ?? commits.map((c) => c.subject)
  return subjects.map((subject) => ({
    sha: bySubject.get(subject)!.sha,
    action: 'pick' as const,
    ...actions[subject],
  })) as RebasePlanItem[]
}

describe('getRebaseCommits', () => {
  it('lists commits after the base, oldest first', async () => {
    const { r, base } = await setup()
    const result = await getRebaseCommits(r.path, base)
    expect(result.commits.map((c) => c.subject)).toEqual(['commit A', 'commit B', 'commit C'])
    expect(result.hasMerges).toBe(false)
    expect((await getRebaseCommits(r.path, 'root')).commits).toHaveLength(4)
  })
})

describe('interactiveRebase', () => {
  it('reorders commits', async () => {
    const { r, base } = await setup()
    const p = await plan(r, base, {}, ['commit C', 'commit A', 'commit B'])
    expect(await interactiveRebase(r.path, base, p)).toEqual({ status: 'done' })
    expect(await messages(r)).toEqual(['commit B', 'commit A', 'commit C', 'base'])
  })

  it('squashes, fixes up, rewords and drops', async () => {
    const { r, base } = await setup()
    const p = await plan(r, base, {
      'commit A': { action: 'reword', message: 'Commit A, reworded\n\nWith a body and a "quote"' },
      'commit B': { action: 'fixup' },
      'commit C': { action: 'drop' },
    })
    await interactiveRebase(r.path, base, p)
    expect(await messages(r)).toEqual(['Commit A, reworded\n\nWith a body and a "quote"', 'base'])
    expect(await files(r)).toEqual(['A.txt', 'B.txt', 'base.txt'])
  })

  it('squash keeps both messages', async () => {
    const { r, base } = await setup()
    const p = await plan(r, base, { 'commit B': { action: 'squash' } })
    await interactiveRebase(r.path, base, p)
    expect((await messages(r))[1]).toBe('commit A\n\ncommit B')
  })

  it('can rebase from the very first commit', async () => {
    const { r } = await setup()
    const p = await plan(r, 'root', { base: { action: 'reword', message: "It's the start" } })
    await interactiveRebase(r.path, 'root', p)
    expect((await messages(r)).at(-1)).toBe("It's the start")
  })

  it('stops with conflicts when reordering changes to the same file', async () => {
    repo = await createTempRepo()
    const r = repo
    await r.write('f.txt', '1\n')
    const base = await r.commit('base')
    await r.write('f.txt', '2\n')
    await r.commit('two')
    await r.write('f.txt', '3\n')
    await r.commit('three')
    const p = await plan(r, base, {}, ['three', 'two'])
    expect(await interactiveRebase(r.path, base, p)).toEqual({ status: 'conflicts' })
    expect((await getStatus(r.path)).operation).toBe('rebase')
    await abortOperation(r.path, 'rebase')
    expect(await messages(r)).toEqual(['three', 'two', 'base'])
  })
})

describe('validateRebasePlan', () => {
  const item = (action: RebasePlanItem['action'], message?: string): RebasePlanItem => ({ sha: 'a', action, message })
  it('rejects plans git would refuse', () => {
    expect(validateRebasePlan([item('drop'), item('drop')])).toMatch(/kept/)
    expect(validateRebasePlan([item('squash'), item('pick')])).toMatch(/first commit/)
    expect(validateRebasePlan([item('drop'), item('fixup')])).toMatch(/first commit/)
    expect(validateRebasePlan([item('reword', ' ')])).toMatch(/message/)
    expect(validateRebasePlan([item('pick'), item('squash')])).toBeNull()
  })
})

describe('buildRebaseTodo', () => {
  it('turns rewords into pick + amend', () => {
    const todo = buildRebaseTodo(
      [
        { sha: 'aaa', action: 'reword', message: 'x' },
        { sha: 'bbb', action: 'fixup' },
      ],
      () => "C:\\temp\\it's\\msg.txt",
    )
    expect(todo).toBe(
      "pick aaa\nexec git commit --amend --cleanup=whitespace --quiet -F 'C:/temp/it'\\''s/msg.txt'\nfixup bbb\n",
    )
  })
})
