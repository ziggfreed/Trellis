/**
 * Links to the user guide (the GitHub wiki, whose pages live in docs/wiki
 * in the Trellis repository) and to the issue tracker.
 *
 * Links open in the user's browser: the main process turns window.open()
 * into shell.openExternal() (see setWindowOpenHandler in main/index.ts).
 */

const REPO_URL = 'https://github.com/ziggfreed/Trellis'

/**
 * The user guide's pages, for "User guide: choose a page…" in the command
 * palette. `page` is the wiki page name (its file name in docs/wiki);
 * help.test.ts checks they all exist.
 */
export const GUIDE_PAGES: readonly { page: string; title: string }[] = [
  { page: 'Getting-Started', title: 'Getting started' },
  { page: 'The-Repository-Window', title: 'The repository window' },
  { page: 'Command-Palette', title: 'The command palette' },
  { page: 'History-and-Diffs', title: 'History and diffs' },
  { page: 'Staging-and-Committing', title: 'Staging and committing' },
  { page: 'Branches-and-Remotes', title: 'Branches and remotes' },
  { page: 'Merges-Rebases-and-Conflicts', title: 'Merges, rebases and conflicts' },
  { page: 'Undo-and-Recovering-Work', title: 'Undo and recovering work' },
  { page: 'Several-Repositories', title: 'Several repositories' },
  { page: 'Submodules-and-Git-LFS', title: 'Submodules and Git LFS' },
  { page: 'GitHub', title: 'GitHub' },
  { page: 'AI-Features', title: 'AI features' },
  { page: 'Using-Plugins', title: 'Using plugins' },
  { page: 'Writing-Plugins', title: 'Writing plugins' },
  { page: 'Settings-and-Keyboard-Shortcuts', title: 'Settings and keyboard shortcuts' },
  { page: 'Troubleshooting', title: 'Troubleshooting' },
]

/** Address of the user guide, or of one of its pages (e.g. "Command-Palette"). */
export function wikiUrl(page?: string): string {
  return page ? `${REPO_URL}/wiki/${page}` : `${REPO_URL}/wiki`
}

/** Open the user guide (or one page of it) in the browser. */
export function openUserGuide(page?: string): void {
  window.open(wikiUrl(page), '_blank')
}

/** Open the "new issue" page, to report a problem or suggest something. */
export function openIssueTracker(): void {
  window.open(`${REPO_URL}/issues/new/choose`, '_blank')
}
