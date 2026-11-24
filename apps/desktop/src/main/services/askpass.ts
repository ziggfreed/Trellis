/**
 * Lets git ask the user for credentials (usernames, passwords, tokens, SSH
 * key passphrases and SSH host key confirmations) through the app's UI.
 *
 * HOW IT WORKS
 * When git (or ssh) needs to ask something and can't use a terminal, it runs
 * the program named in GIT_ASKPASS (or SSH_ASKPASS), passing the question
 * as an argument, and reads the answer from its output.
 *
 *   git ──runs──> askpass.sh "Password for 'https://github.com': "
 *                    └─runs─> askpass.js (Node, using Electron's own binary)
 *                               └─connects to─> this server (local socket)
 *                                                 └─> onPrompt(...) ─> UI dialog
 *   git <──prints answer── askpass.js <──answer─────────┘
 *
 * - The socket is a named pipe on Windows and a Unix socket elsewhere.
 * - A random token, passed to askpass.js through the environment, stops
 *   other programs on the machine from talking to the server.
 * - If the user cancels, askpass.js exits with an error and git reports
 *   that authentication failed.
 *
 * Credentials the user has already saved with a git credential helper
 * (e.g. Git Credential Manager or the macOS keychain) are used first;
 * git only asks when it has nothing saved.
 *
 * This file uses only Node APIs (no Electron), so it can be unit tested.
 */
import { randomBytes } from 'node:crypto'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Answer a prompt from git: return the text to send, or null if the user cancelled. */
export type PromptHandler = (prompt: string) => Promise<string | null>

/** Shell wrapper git runs. Git for Windows runs `#!/bin/sh` scripts with its bundled shell. */
const SHELL_SCRIPT = `#!/bin/sh
# Trellis askpass helper: forwards git's question to the Trellis window.
ELECTRON_RUN_AS_NODE=1 exec "$TRELLIS_ASKPASS_NODE" "$TRELLIS_ASKPASS_SCRIPT" "$@"
`

/** Node client: sends the prompt to the server and prints the answer. */
const NODE_SCRIPT = `// Trellis askpass client. See apps/desktop/src/main/services/askpass.ts
const net = require('net')
const socket = net.connect(process.env.TRELLIS_ASKPASS_SOCKET)
let reply = ''
socket.on('connect', () => {
  socket.write(JSON.stringify({ token: process.env.TRELLIS_ASKPASS_TOKEN, prompt: process.argv[2] || '' }) + '\\n')
})
socket.on('data', (chunk) => { reply += chunk })
socket.on('end', () => {
  try {
    const { answer } = JSON.parse(reply)
    if (typeof answer !== 'string') process.exit(1)
    process.stdout.write(answer + '\\n')
    process.exit(0)
  } catch {
    process.exit(1)
  }
})
socket.on('error', () => process.exit(1))
`

export class AskpassServer {
  private server: Server | null = null
  private readonly token = randomBytes(24).toString('hex')
  private readonly socketPath: string

  constructor(
    /** Folder to write the helper scripts into (must be on a real disk, not in an asar). */
    private readonly scriptDir: string,
    private readonly onPrompt: PromptHandler,
    /** The program that runs askpass.js: Electron's binary (as Node) or Node itself in tests. */
    private readonly nodePath: string = process.execPath,
  ) {
    const id = randomBytes(8).toString('hex')
    this.socketPath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\trellis-askpass-${id}`
        : join(tmpdir(), `trellis-askpass-${id}.sock`)
  }

  /**
   * Start listening and write the helper scripts. Returns the environment
   * variables to give git (see setGitEnvironment in @trellis/git).
   */
  async start(): Promise<Record<string, string>> {
    await mkdir(this.scriptDir, { recursive: true })
    const shellScript = join(this.scriptDir, 'askpass.sh')
    const nodeScript = join(this.scriptDir, 'askpass.js')
    await writeFile(shellScript, SHELL_SCRIPT)
    await writeFile(nodeScript, NODE_SCRIPT)
    await chmod(shellScript, 0o755)

    if (process.platform !== 'win32') await rm(this.socketPath, { force: true })
    this.server = createServer((socket) => this.handle(socket))
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.socketPath, resolve)
    })

    return {
      GIT_ASKPASS: shellScript,
      SSH_ASKPASS: shellScript,
      // Make ssh use SSH_ASKPASS even without a graphical display (OpenSSH 8.4+).
      SSH_ASKPASS_REQUIRE: 'force',
      TRELLIS_ASKPASS_NODE: this.nodePath,
      TRELLIS_ASKPASS_SCRIPT: nodeScript,
      TRELLIS_ASKPASS_SOCKET: this.socketPath,
      TRELLIS_ASKPASS_TOKEN: this.token,
    }
  }

  close(): void {
    this.server?.close()
    this.server = null
  }

  private handle(socket: Socket): void {
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      const newline = buffer.indexOf('\n')
      if (newline === -1) return
      const line = buffer.slice(0, newline)
      buffer = ''
      void this.answer(line).then((answer) => socket.end(JSON.stringify({ answer })))
    })
    socket.on('error', () => socket.destroy())
  }

  private async answer(line: string): Promise<string | null> {
    try {
      const request = JSON.parse(line) as { token?: unknown; prompt?: unknown }
      if (request.token !== this.token || typeof request.prompt !== 'string') return null
      return await this.onPrompt(request.prompt)
    } catch {
      return null
    }
  }
}

/** Should the answer to this prompt be hidden as it's typed (like a password)? */
export function isSecretPrompt(prompt: string): boolean {
  return /password|passphrase|token|secret|pin\b/i.test(prompt)
}
