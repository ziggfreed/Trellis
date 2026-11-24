/**
 * Opening the user's own terminal or code editor at a repository.
 *
 * There's no standard way to do this on every OS, so we try the usual
 * programs in order until one starts. Each is started "detached" so it
 * keeps running if Trellis closes.
 */
import { spawn, type SpawnOptions } from 'node:child_process'

/** Start a program; resolves false if it isn't installed (so the next one can be tried). */
function trySpawn(command: string, args: string[], options: SpawnOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore', ...options })
      child.once('error', () => resolve(false))
      child.once('spawn', () => {
        child.unref()
        resolve(true)
      })
    } catch {
      resolve(false)
    }
  })
}

/** Terminal programs to try on each platform, in order. */
function terminalCandidates(dir: string): [string, string[], SpawnOptions?][] {
  switch (process.platform) {
    case 'win32':
      return [
        ['wt.exe', ['-d', dir]], // Windows Terminal
        ['cmd.exe', ['/c', 'start', 'cmd.exe'], { cwd: dir }],
      ]
    case 'darwin':
      return [['open', ['-a', 'Terminal', dir]]]
    default:
      return [
        ['x-terminal-emulator', [], { cwd: dir }],
        ['gnome-terminal', [`--working-directory=${dir}`]],
        ['konsole', ['--workdir', dir]],
        ['xfce4-terminal', [`--working-directory=${dir}`]],
        ['kitty', ['--directory', dir]],
        ['alacritty', ['--working-directory', dir]],
        ['xterm', [], { cwd: dir }],
      ]
  }
}

export async function openTerminal(dir: string): Promise<void> {
  for (const [command, args, options] of terminalCandidates(dir)) {
    if (await trySpawn(command, args, options)) return
  }
  throw new Error('Couldn’t find a terminal program to open.')
}

/** Quote an argument for cmd.exe (used on Windows, where editors are often .cmd scripts). */
const quoteForCmd = (arg: string) => `"${arg.replaceAll('"', '""')}"`

/**
 * Open `dir` (and optionally a file in it) in the user's editor. `command`
 * is the editor's command-line program, e.g. "code" (VS Code), "cursor",
 * "subl" or "idea"; it defaults to VS Code.
 */
export async function openEditor(
  dir: string,
  file: string | undefined,
  command: string,
): Promise<void> {
  const program = command.trim() || 'code'
  const args = file ? [dir, `${dir}/${file}`] : [dir]
  const windows = process.platform === 'win32'
  const started = windows
    ? // Many editors install a .cmd launcher on Windows, which needs a shell to run.
      await trySpawn(program, args.map(quoteForCmd), { shell: true, windowsHide: true })
    : await trySpawn(program, args)
  if (!started) {
    throw new Error(
      `Couldn’t start the editor “${program}”. Set your editor's command in Settings.`,
    )
  }
}
