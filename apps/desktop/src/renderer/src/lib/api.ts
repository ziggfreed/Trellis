/**
 * Typed access to the main process from the UI.
 *
 *   const summary = await api.invoke('repo:getSummary', path)
 *
 * The available calls, and their argument/result types, are defined in
 * src/shared/ipc.ts.
 */
import type { TrellisBridge } from '@shared/ipc'

// `window` only exists in the app's page. Unit tests run in Node, where
// importing this file must not crash (calling the api there is a mistake).
export const api = (typeof window === 'undefined' ? undefined : window.trellis) as TrellisBridge
