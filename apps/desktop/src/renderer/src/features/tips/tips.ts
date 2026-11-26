/**
 * Tips shown on the home screen (tips-card.tsx), one at a time, so new users
 * discover features that aren't obvious from the buttons alone.
 *
 * Each tip can name a keyboard shortcut (by action id, so the card shows the
 * user's own binding) and a page of the user guide for "Learn more".
 * tips.test.ts checks that every page exists in docs/wiki and every
 * shortcut id is a real action, so the links can't silently break.
 */

export interface Tip {
  /** Stable id (for React keys and tests). */
  id: string
  title: string
  body: string
  /** Shortcut action id from shortcut-actions.ts, shown as a key hint. */
  shortcut?: string
  /** User guide page for "Learn more", e.g. "Command-Palette". */
  page?: string
}

export const TIPS: readonly Tip[] = [
  {
    id: 'palette',
    title: 'Every action is in the command palette',
    body: 'Not sure where something is? Open the command palette and type what you want to do, like “pull”, “stash” or “check out”.',
    shortcut: 'palette',
    page: 'Command-Palette',
  },
  {
    id: 'undo',
    title: 'Undo works for git, too',
    body: 'Undo takes back commits, merges, rebases, discarded changes and deleted branches. Hover over the undo button to see what it will undo.',
    shortcut: 'undo',
    page: 'Undo-and-Recovering-Work',
  },
  {
    id: 'stage-lines',
    title: 'Commit only some lines',
    body: 'In the Changes view, click changed lines in the diff (Shift+click for a range), then stage just those lines.',
    page: 'Staging-and-Committing#staging-part-of-a-file',
  },
  {
    id: 'right-click',
    title: 'Right-click everything',
    body: 'Commits, branches, tags, stashes, remotes and files all have right-click menus with their actions.',
    page: 'The-Repository-Window#right-click-everything',
  },
  {
    id: 'double-click',
    title: 'Double-click to switch branch',
    body: 'Double-click a branch in the sidebar, a branch label or a commit in the history to check it out. Remote branches become local ones.',
    page: 'Branches-and-Remotes#creating-and-switching-branches',
  },
  {
    id: 'drag-branches',
    title: 'Drag branches to merge or rebase',
    body: 'Drag a branch label onto another branch or a commit, and choose to merge, rebase, move or compare.',
    page: 'Branches-and-Remotes#drag-and-drop',
  },
  {
    id: 'git-log',
    title: 'See every git command',
    body: 'The Git log in the status bar lists each command Trellis runs and what it printed. Handy for learning git, or when something fails.',
    shortcut: 'commandLog',
    page: 'The-Repository-Window#the-git-log-see-exactly-what-trellis-runs',
  },
  {
    id: 'lost-commits',
    title: 'Commits are hard to lose',
    body: 'After a bad reset or a deleted branch, search the command palette for “lost” to find commits that aren’t on any branch any more.',
    page: 'Undo-and-Recovering-Work#finding-lost-commits',
  },
  {
    id: 'clean-up',
    title: 'Tidy up old branches',
    body: 'The broom on the Branches heading finds branches that are merged (including squash-merged on GitHub) or whose remote is gone.',
    page: 'Branches-and-Remotes#cleaning-up-old-branches',
  },
  {
    id: 'compare',
    title: 'Compare any two commits',
    body: 'Ctrl+click (Cmd+click on a Mac) a second commit in the history to see everything that changed between the two.',
    page: 'History-and-Diffs#comparing',
  },
  {
    id: 'code-search',
    title: 'Find when code appeared',
    body: 'Filter the history by “Code added or removed” to find the commits that added or removed some text, such as a function name.',
    page: 'History-and-Diffs#searching-and-filtering',
  },
  {
    id: 'recent-messages',
    title: 'Reuse a commit message',
    body: 'The clock button next to the commit summary lists your recent messages. Take the whole message, or just its summary or description.',
    page: 'Staging-and-Committing#writing-the-message',
  },
  {
    id: 'interactive-rebase',
    title: 'Tidy commits before sharing',
    body: 'Right-click a commit and choose “Interactive rebase from here…” to reorder, reword, squash or drop commits. One undo puts it all back.',
    page: 'Merges-Rebases-and-Conflicts#interactive-rebase-tidying-up-commits',
  },
  {
    id: 'workspaces',
    title: 'Open a set of repositories at once',
    body: 'Save your open tabs as a workspace, then open them all again in one click from the home screen.',
    page: 'Several-Repositories#workspaces',
  },
  {
    id: 'image-diff',
    title: 'Compare pictures',
    body: 'Changed images are shown as pictures. Try Swipe or Onion skin to spot small differences.',
    page: 'History-and-Diffs#pictures-markdown-and-json',
  },
  {
    id: 'shortcuts',
    title: 'Make your own shortcuts',
    body: 'Change any keyboard shortcut, or add ones for Fetch, Pull and Push, in Settings > Keyboard shortcuts.',
    shortcut: 'settings',
    page: 'Settings-and-Keyboard-Shortcuts',
  },
  {
    id: 'plugins',
    title: 'Add your own commands',
    body: 'Plugins are small JavaScript packages that add commands, menu items and sidebar panels. You can write one in a few minutes.',
    page: 'Writing-Plugins',
  },
]

/** `index` moved by `step` places, wrapping around a list of `count` items. */
export function wrapIndex(index: number, step: number, count: number): number {
  if (count <= 0) return 0
  return (((index + step) % count) + count) % count
}

/**
 * Which tip to start with on a given day: a different one each day (in
 * order), so opening Trellis shows something new without repeating
 * yesterday's tip.
 */
export function tipIndexForDate(date: Date, count: number): number {
  if (count <= 0) return 0
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  return day % count
}
