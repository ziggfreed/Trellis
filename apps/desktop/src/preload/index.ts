/**
 * Preload script: the ONLY bridge between the UI and Node.js/Electron.
 *
 * The renderer runs with `contextIsolation` and `sandbox` turned on, so it has
 * no access to Node. Instead we expose a single, minimal object on
 * `window.trellis` that can only send requests and receive events on the
 * channels listed in src/shared/ipc.ts.
 * Keep this file tiny: real work belongs in the main process.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, IPC_EVENTS, type TrellisBridge } from '@shared/ipc'

const allowedChannels = new Set<string>(IPC_CHANNELS)
const allowedEvents = new Set<string>(IPC_EVENTS)

const bridge: TrellisBridge = {
  invoke(channel, ...args) {
    if (!allowedChannels.has(channel)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  on(event, listener) {
    if (!allowedEvents.has(event)) throw new Error(`Unknown IPC event: ${event}`)
    // Wrap the listener so the UI never receives Electron's event object.
    const handler = (_event: IpcRendererEvent, payload: Parameters<typeof listener>[0]) =>
      listener(payload)
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.removeListener(event, handler)
  },
}

contextBridge.exposeInMainWorld('trellis', bridge)
