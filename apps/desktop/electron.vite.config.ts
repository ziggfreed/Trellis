/**
 * Build configuration for the three parts of an Electron app:
 *   main     - Node.js process: windows, git, file system  (src/main)
 *   preload  - tiny bridge that exposes a safe API to the UI (src/preload)
 *   renderer - the React UI, runs like a web page          (src/renderer)
 * Docs: https://electron-vite.org/config/
 */
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Workspace packages are TypeScript source, so they must be bundled into the
// output rather than loaded from node_modules at runtime.
const bundledWorkspacePackages = ['@trellis/git', '@trellis/plugin-api']

const shared = { '@shared': resolve(import.meta.dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: { externalizeDeps: { exclude: bundledWorkspacePackages } },
  },
  preload: {
    resolve: { alias: shared },
    build: {
      // Sandboxed preload scripts must be CommonJS.
      rolldownOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    resolve: {
      alias: { ...shared, '@': resolve(import.meta.dirname, 'src/renderer/src') },
    },
    plugins: [react(), tailwindcss()],
    // Minify the UI code: it's the biggest part of the app and is parsed on
    // every start-up. (Main and preload are small, so they stay readable.)
    build: { minify: true },
  },
})
