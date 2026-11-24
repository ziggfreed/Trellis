/**
 * Formatting git commands for the command log. Pure (no app state), so it can
 * be unit tested.
 */

/** Format a command for display and copying, quoting arguments with spaces. */
export function formatCommand(args: readonly string[]): string {
  const quote = (arg: string) =>
    /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`
  return ['git', ...args.map(quote)].join(' ')
}
