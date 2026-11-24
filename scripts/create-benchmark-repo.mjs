#!/usr/bin/env node
/**
 * Creates a large git repository for performance testing.
 *
 *   node scripts/create-benchmark-repo.mjs <folder> [commits=100000]
 *
 * The history looks like a busy real project: a main branch with feature
 * branches that split off, get a few commits, and are merged back. Up to 8
 * feature branches are open at once (they stay as branches at the end).
 *
 * It uses `git fast-import`, which writes commits directly and can create
 * 100,000 commits in a few seconds (running `git commit` 100k times would
 * take a very long time).
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'

const [folder, countArg = '100000'] = process.argv.slice(2)
if (!folder) {
  console.error('Usage: node scripts/create-benchmark-repo.mjs <folder> [commits]')
  process.exit(1)
}
const count = Number(countArg)
if (existsSync(folder) && readdirSync(folder).length > 0) {
  console.error(`${folder} already exists and is not empty`)
  process.exit(1)
}
mkdirSync(folder, { recursive: true })
execFileSync('git', ['init', '-q', '-b', 'main', folder])

// Seeded random numbers so every run builds the same history.
let seed = 12345
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}

const git = spawn('git', ['fast-import', '--quiet'], {
  cwd: folder,
  stdio: ['pipe', 'inherit', 'inherit'],
})
const write = (text) => git.stdin.write(text)
const data = (text) => `data ${Buffer.byteLength(text)}\n${text}\n`

let mainHead = 0 // mark of the latest commit on main (0 = none yet)
/** Open feature branches: slot -> { head mark, commits made } */
const slots = new Map()
const startTime = 1_600_000_000

for (let i = 1; i <= count; i++) {
  let ref = 'refs/heads/main'
  let from = mainHead
  let merge = 0
  let message = `Commit ${i} on main`

  const openSlots = [...slots.keys()]
  const roll = random()
  if (mainHead && openSlots.length < 8 && roll < 0.06) {
    // Start a new feature branch from main.
    const slot = [0, 1, 2, 3, 4, 5, 6, 7].find((s) => !slots.has(s))
    slots.set(slot, { head: 0, base: mainHead, commits: 0 })
    ref = `refs/heads/feature/slot-${slot}`
    from = mainHead
    message = `Start feature ${i}`
  } else if (openSlots.length && roll < 0.45) {
    // Work on an open feature branch.
    const slot = openSlots[Math.floor(random() * openSlots.length)]
    const branch = slots.get(slot)
    ref = `refs/heads/feature/slot-${slot}`
    from = branch.head || branch.base
    message = `Work on feature (commit ${i})`
  } else if (openSlots.length && roll < 0.53) {
    // Merge a feature branch into main.
    const slot = openSlots[Math.floor(random() * openSlots.length)]
    const branch = slots.get(slot)
    if (branch.head) {
      merge = branch.head
      message = `Merge feature/slot-${slot} (commit ${i})`
      slots.delete(slot)
    }
  }

  const file = `src/module-${i % 200}.txt`
  write(`commit ${ref}\nmark :${i}\n`)
  write(`committer Benchmark <bench@example.com> ${startTime + i * 60} +0000\n`)
  write(data(message))
  if (from) write(`from :${from}\n`)
  if (merge) write(`merge :${merge}\n`)
  write(`M 100644 inline ${file}\n${data(`${message}\n`)}`)

  if (ref === 'refs/heads/main') mainHead = i
  else {
    const slot = Number(ref.split('-').pop())
    slots.get(slot).head = i
  }
}
git.stdin.end()
git.on('close', (code) => {
  if (code !== 0) process.exit(code ?? 1)
  execFileSync('git', ['checkout', '-q', '-f', 'main'], { cwd: folder })
  // A commit-graph file makes `git log --topo-order` much faster, as `git gc` would.
  execFileSync('git', ['commit-graph', 'write', '--reachable'], { cwd: folder })
  console.log(`Created ${count} commits in ${folder}`)
})
