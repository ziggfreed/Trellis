/**
 * Rules for interactive rebase plans. No Node.js code here, so the UI can
 * use it too (as `@trellis/git/rebase-plan`) to explain problems before the
 * user starts the rebase.
 */
import type { RebasePlanItem } from './types'

/**
 * Check a plan before running it. Returns a message explaining the problem,
 * or null if it's OK.
 */
export function validateRebasePlan(plan: readonly RebasePlanItem[]): string | null {
  const kept = plan.filter((item) => item.action !== 'drop')
  if (kept.length === 0)
    return 'At least one commit must be kept. To remove them all, use Reset instead.'
  const first = kept[0]!
  if (first.action === 'squash' || first.action === 'fixup') {
    return 'The first commit can’t be squashed or fixed up, as there’s no earlier commit to combine it with.'
  }
  for (const item of plan) {
    if (item.action === 'reword' && !item.message?.trim())
      return 'A reworded commit needs a message.'
  }
  return null
}
