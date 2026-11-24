/**
 * @trellis/git: the only place in Trellis that talks to the git program.
 *
 * Rules for this package:
 *   - No Electron, React or browser APIs. Plain Node.js only.
 *   - Every exported function gets a unit test in ../test.
 *   - Parse git's output into typed objects here, so the app never has to.
 */
export * from './run-git'
export * from './version'
export * from './repository'
export type * from './types'
