/**
 * Typed access to the main process from the UI.
 *
 *   const summary = await api.invoke('repo:getSummary', path)
 *
 * The available calls, and their argument/result types, are defined in
 * src/shared/ipc.ts.
 */
export const api = window.trellis
