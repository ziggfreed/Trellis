/**
 * Turns errors from the main process into messages fit for the user.
 *
 * Electron wraps errors thrown by IPC handlers like this:
 *   "Error invoking remote method 'repo:commit': Error: git commit -F - failed: <git's message>"
 * The user only needs git's message.
 */
export function errorMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error)
  message = message.replace(/^Error invoking remote method '[^']+': /, '')
  message = message.replace(/^(?:Git)?Error: /, '')
  message = message.replace(/^git [^\n]*? failed: /, '')
  return message.trim() || 'Something went wrong.'
}
