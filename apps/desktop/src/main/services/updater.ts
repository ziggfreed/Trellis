/**
 * Automatic updates, from the project's GitHub Releases (electron-updater).
 *
 * How it works:
 *   1. A release build includes `latest.yml` / `latest-mac.yml` /
 *      `latest-linux.yml` files describing the newest version. The release
 *      workflow uploads them next to the installers.
 *   2. A few seconds after start-up (and then every few hours) Trellis reads
 *      those files from the latest *published* GitHub release. Draft releases
 *      are invisible to it, so nothing reaches users until a maintainer
 *      publishes the release.
 *   3. A newer version downloads in the background; the UI then offers
 *      "Restart to update". If the user doesn't, it installs on the next quit.
 *
 * macOS only accepts updates for signed apps, so an unsigned macOS build
 * (see docs/RELEASING.md) only says a new version exists, with a link to
 * download it. Development builds never check.
 *
 * The UI follows along via `update:status` events (UpdateStatus in
 * shared/ipc.ts).
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/ipc'

// electron-updater is a CommonJS package; its exports arrive as `default`.
const { autoUpdater } = electronUpdater

/** Where users can download a release by hand. */
export const RELEASES_URL = 'https://github.com/ziggfreed/Trellis/releases/latest'
/** First check shortly after start-up, so it doesn't slow the launch down. */
const FIRST_CHECK_MS = 10_000
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

/**
 * Whether a macOS app is signed with a real Developer ID (not just the
 * "ad-hoc" signature every Apple Silicon build gets). Updates only install
 * into properly signed apps.
 */
function isMacAppSigned(): Promise<boolean> {
  // The .app bundle: .../Trellis.app/Contents/MacOS/Trellis -> .../Trellis.app
  const bundle = app.getPath('exe').replace(/\/Contents\/MacOS\/[^/]+$/, '')
  return new Promise((resolve) => {
    execFile('codesign', ['-dv', bundle], (error, _stdout, stderr) => {
      resolve(!error && /TeamIdentifier=(?!not set)\S+/.test(stderr))
    })
  })
}

/**
 * Why this copy of Trellis can't update itself, or null if it can. On Linux
 * only the AppImage and the .deb/.rpm packages can (electron-builder marks
 * packages with a `package-type` file); e.g. an unpacked folder can't.
 */
function cannotUpdateReason(): string | null {
  if (!app.isPackaged) return 'Development builds don’t update themselves.'
  if (
    process.platform === 'linux' &&
    !process.env.APPIMAGE &&
    !existsSync(join(process.resourcesPath, 'package-type'))
  ) {
    return 'This copy of Trellis can’t update itself. Download new versions from GitHub.'
  }
  return null
}

export class Updater {
  private status: UpdateStatus = { state: 'idle' }
  private timers: NodeJS.Timeout[] = []
  private canInstall = true

  constructor(
    private readonly isEnabled: () => boolean,
    private readonly onStatus: (status: UpdateStatus) => void,
  ) {}

  private readonly unsupportedReason = cannotUpdateReason()

  getStatus(): UpdateStatus {
    return this.status
  }

  async start(): Promise<void> {
    if (this.unsupportedReason) return
    if (process.platform === 'darwin') this.canInstall = await isMacAppSigned()
    // Unsigned macOS builds can't install updates, so don't download them.
    autoUpdater.autoDownload = this.canInstall
    autoUpdater.autoInstallOnAppQuit = this.canInstall
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ state: 'upToDate' }))
    autoUpdater.on('update-available', (info) =>
      this.set(
        this.canInstall
          ? { state: 'downloading', version: info.version, percent: 0 }
          : { state: 'available', version: info.version, url: RELEASES_URL },
      ),
    )
    autoUpdater.on('download-progress', (progress) => {
      if (this.status.state === 'downloading') {
        this.set({ ...this.status, percent: Math.round(progress.percent) })
      }
    })
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ state: 'ready', version: info.version }),
    )
    autoUpdater.on('error', (error) =>
      this.set({ state: 'error', message: error instanceof Error ? error.message : String(error) }),
    )

    const checkIfEnabled = () => {
      if (this.isEnabled()) void this.check()
    }
    this.timers.push(setTimeout(checkIfEnabled, FIRST_CHECK_MS))
    this.timers.push(setInterval(checkIfEnabled, CHECK_EVERY_MS))
  }

  /** Look for a new version now (the "Check for updates" button). */
  async check(): Promise<void> {
    if (this.unsupportedReason) {
      this.set({ state: 'unsupported', message: this.unsupportedReason })
      return
    }
    // Don't interrupt a download, or re-download one that's ready.
    if (this.status.state === 'downloading' || this.status.state === 'ready') return
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      this.set({ state: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Quit and install a downloaded update. */
  install(): void {
    if (this.status.state === 'ready') autoUpdater.quitAndInstall()
  }

  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer)
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.onStatus(status)
  }
}
