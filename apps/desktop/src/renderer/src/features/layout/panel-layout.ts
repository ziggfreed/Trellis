/**
 * Remembers the sizes of resizable panels (the sidebar, the history's
 * bottom panels, ...) between launches, in the settings file.
 *
 * Usage, on a ResizablePanelGroup whose panels each have an `id`:
 *
 *   <ResizablePanelGroup {...usePanelLayout('history-layout', ['list', 'bottom'])}>
 *
 * The saved layout is read when the group mounts (react-resizable-panels
 * only uses `defaultLayout` then), and saved when the user finishes a drag.
 */
import { useState } from 'react'
import type { LayoutChangedMeta } from 'react-resizable-panels'
import { useSettingsStore } from '@/features/settings/settings-store'

type Layout = Record<string, number>

/**
 * A saved layout if it still fits the group's panels, else undefined (the
 * panels then use their default sizes). A layout saved by another version
 * of Trellis may name different panels, or the file may have been edited.
 */
export function usableLayout(saved: unknown, panelIds: string[]): Layout | undefined {
  if (typeof saved !== 'object' || saved === null) return undefined
  const entries = Object.entries(saved as Record<string, unknown>)
  const sameIds =
    entries.length === panelIds.length && panelIds.every((id) => id in (saved as object))
  if (!sameIds) return undefined
  if (!entries.every(([, size]) => typeof size === 'number' && size > 0 && size < 100)) {
    return undefined
  }
  const total = entries.reduce((sum, [, size]) => sum + (size as number), 0)
  return Math.abs(total - 100) < 1 ? (saved as Layout) : undefined
}

/** Props for a ResizablePanelGroup that make it remember its layout. */
export function usePanelLayout(id: string, panelIds: string[]) {
  // Read once, at mount: later changes come from this group itself.
  const [defaultLayout] = useState(() =>
    usableLayout(useSettingsStore.getState().settings.panelLayouts[id], panelIds),
  )
  const onLayoutChanged = (layout: Layout, meta: LayoutChangedMeta) => {
    // Only save sizes the user chose by dragging, not changes from mounting
    // or the window being resized.
    if (!meta.isUserInteraction) return
    // The requested layout is what the user asked for before a too-small
    // window squeezed it, so it's the better one to restore next time.
    const { settings, update } = useSettingsStore.getState()
    update({ panelLayouts: { ...settings.panelLayouts, [id]: meta.requestedLayout ?? layout } })
  }
  return { id, defaultLayout, onLayoutChanged }
}
