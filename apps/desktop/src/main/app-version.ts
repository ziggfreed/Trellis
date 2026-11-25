/**
 * The Trellis version, read from apps/desktop/package.json at build time.
 * (Electron's app.getVersion() reports Electron's own version when the app
 * is started from a script, as in development and e2e tests.)
 */
import packageJson from '../../package.json'

export const APP_VERSION: string = packageJson.version
