/**
 * Preload script: the ONLY bridge between the UI and Node.js/Electron.
 *
 * The renderer runs with `contextIsolation` and `sandbox` turned on, so it has
 * no access to Node. Instead we expose a single, minimal object on
 * `window.trellis` that can only send requests on known IPC channels.
 * Keep this file tiny: real work belongs in the main process.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type TrellisBridge } from '@shared/ipc'

const allowed = new Set<string>(IPC_CHANNELS)

const bridge: TrellisBridge = {
  invoke(channel, ...args) {
    if (!allowed.has(channel)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
}

contextBridge.exposeInMainWorld('trellis', bridge)
