/**
 * Pure helpers for the blame view.
 */
import type { BlameLine } from '@shared/ipc'

/** Consecutive lines from the same commit, shown with one label. */
export interface BlameGroup {
  sha: string
  lines: BlameLine[]
}

export function groupBlameLines(lines: readonly BlameLine[]): BlameGroup[] {
  const groups: BlameGroup[] = []
  for (const line of lines) {
    const last = groups.at(-1)
    if (last && last.sha === line.sha) last.lines.push(line)
    else groups.push({ sha: line.sha, lines: [line] })
  }
  return groups
}

/**
 * How recent a change is on a 0..1 scale (1 = newest), for the colour bar
 * beside each group. Uses each commit's position among all the file's
 * commit times rather than raw time, so a long quiet period doesn't make
 * everything look equally old.
 */
export function ageScale(times: readonly number[]): (time: number) => number {
  const sorted = [...new Set(times)].sort((a, b) => a - b)
  if (sorted.length <= 1) return () => 1
  return (time) => sorted.indexOf(time) / (sorted.length - 1)
}
