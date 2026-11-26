/**
 * The current time, updated every minute, so the timeline's "now" line and
 * "stale" markers keep up while the app stays open. (Reading the clock
 * directly while rendering would give different answers on each render.)
 */
import { useEffect, useState } from 'react'

export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
