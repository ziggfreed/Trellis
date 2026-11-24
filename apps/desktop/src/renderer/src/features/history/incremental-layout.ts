/**
 * Keeps the commit graph layout up to date as history pages load.
 *
 * TanStack Query gives us an array of pages. When a new page is appended we
 * only lay out the new commits; if earlier pages changed (history was
 * reloaded after a commit or fetch), we start again from scratch. Laying
 * out a 500-commit page takes about a millisecond, so this happens directly
 * on the UI thread.
 */
import { GraphLayout, type GraphRow } from '@trellis/graph-layout'
import type { LogPage } from '@shared/ipc'

export interface LayoutSnapshot {
  rows: readonly GraphRow[]
  /** Graph width in lanes. */
  width: number
}

export class IncrementalLayout {
  private pages: readonly LogPage[] = []
  private layout = new GraphLayout()

  update(pages: readonly LogPage[]): LayoutSnapshot {
    const canContinue =
      this.pages.length <= pages.length && this.pages.every((page, i) => page === pages[i])
    if (!canContinue) {
      this.layout = new GraphLayout()
      this.pages = []
    }
    for (const page of pages.slice(this.pages.length)) this.layout.append(page.commits)
    this.pages = [...pages]
    // Copy the rows array so React sees a new value when rows are added.
    return { rows: [...this.layout.rows], width: this.layout.width }
  }
}
