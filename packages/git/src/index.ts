/**
 * @trellis/git: the only place in Trellis that talks to the git program.
 *
 * Rules for this package:
 *   - No Electron, React or browser APIs. Plain Node.js only.
 *   - Every exported function gets a unit test in ../test.
 *   - Parse git's output into typed objects here, so the app never has to.
 *   - Plain data types go in ./types.ts (importable by the UI as
 *     `@trellis/git/types`, because it contains no Node.js code).
 */
export * from './run-git'
export * from './version'
export * from './repository'
export * from './status'
export * from './log'
export * from './log-reader'
export * from './refs'
export * from './commit'
export * from './file-contents'
export * from './clone'
export type * from './types'
