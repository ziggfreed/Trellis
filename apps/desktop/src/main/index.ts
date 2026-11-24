/**
 * Entry point of the Electron main process.
 *
 * Responsibilities: create the window, apply security settings, and register
 * the IPC handlers that the UI calls. Git work lives in @trellis/git and the
 * handlers in ./ipc, so keep this file about app/window lifecycle only.
 */
import { join } from 'node:path'
import { app, BrowserWindow, shell, nativeTheme } from 'electron'
import { registerIpcHandlers } from './ipc/handlers'
import { SettingsStore } from './services/settings-store'
import { keepLogReaders } from './services/log-cache'

// Tests (and anyone who wants a separate profile) can point Trellis at a
// different data folder so they don't touch the real settings.
if (process.env.TRELLIS_USER_DATA_DIR) {
  app.setPath('userData', process.env.TRELLIS_USER_DATA_DIR)
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Trellis',
    show: false, // shown once the page has rendered, to avoid a white flash
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // Security: the UI is treated like an untrusted web page.
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  // Open web links in the user's browser, never inside the app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  // In development electron-vite serves the UI with hot reload.
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
  return window
}

// Only allow one copy of Trellis; a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  void app.whenReady().then(() => {
    app.setAppUserModelId('dev.trellis.app') // Windows taskbar grouping
    const watcher = registerIpcHandlers(new SettingsStore(app.getPath('userData')))
    app.on('will-quit', () => {
      watcher.dispose()
      keepLogReaders([]) // stop any running git log processes
    })
    createWindow()

    // macOS: re-create a window when the dock icon is clicked.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // Quit when all windows close, except on macOS where apps stay in the dock.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
