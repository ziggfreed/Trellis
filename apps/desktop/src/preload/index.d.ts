import type { TrellisBridge } from '@shared/ipc'

declare global {
  interface Window {
    /** Exposed by src/preload/index.ts. Use `api` from '@/lib/api' instead of this directly. */
    trellis: TrellisBridge
  }
}
