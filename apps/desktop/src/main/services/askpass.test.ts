/**
 * Tests the askpass helper with real git: `git credential fill` asks for a
 * username and password exactly like a clone or push over HTTPS would.
 * Runs on every CI platform, which checks the shell script works on Windows too.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGit, setGitEnvironment } from '@trellis/git'
import { AskpassServer, isSecretPrompt } from './askpass'

let server: AskpassServer | undefined
let dir: string | undefined
afterEach(async () => {
  server?.close()
  setGitEnvironment({})
  if (dir) await rm(dir, { recursive: true, force: true })
})

async function start(onPrompt: (prompt: string) => Promise<string | null>) {
  dir = await mkdtemp(join(tmpdir(), 'trellis-askpass-'))
  // In tests the helper runs with plain Node instead of Electron.
  server = new AskpassServer(join(dir, 'scripts'), onPrompt, process.execPath)
  setGitEnvironment(await server.start())
  return dir
}

/** Ask git for credentials the way it does before an HTTPS request. */
function credentialFill(cwd: string) {
  return runGit(
    // Disable any credential helpers configured on this machine so git must ask us.
    ['-c', 'credential.helper=', 'credential', 'fill'],
    { cwd, stdin: 'protocol=https\nhost=example.com\n\n', okExitCodes: [0, 128] },
  )
}

describe('AskpassServer', () => {
  it('answers git’s username and password prompts', async () => {
    const prompts: string[] = []
    const cwd = await start(async (prompt) => {
      prompts.push(prompt)
      return prompt.startsWith('Username') ? 'alice' : 's3cret'
    })
    const result = await credentialFill(cwd)
    expect(result.stdout).toContain('username=alice')
    expect(result.stdout).toContain('password=s3cret')
    expect(prompts).toEqual([
      "Username for 'https://example.com': ",
      "Password for 'https://alice@example.com': ",
    ])
  })

  it('makes git fail when the user cancels', async () => {
    const cwd = await start(async () => null)
    const result = await credentialFill(cwd)
    expect(result.exitCode).not.toBe(0)
  })
})

describe('isSecretPrompt', () => {
  it.each([
    ["Password for 'https://x@github.com': ", true],
    ["Enter passphrase for key '/home/me/.ssh/id_ed25519': ", true],
    ["Username for 'https://github.com': ", false],
    ['Are you sure you want to continue connecting (yes/no/[fingerprint])? ', false],
  ])('%s -> %s', (prompt, secret) => {
    expect(isSecretPrompt(prompt)).toBe(secret)
  })
})
