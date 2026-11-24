/**
 * The "open / clone / new repository" actions, shared by the home screen,
 * the tab bar menu and keyboard shortcuts. Errors are shown as toasts.
 */
import { toast } from 'sonner'
import { openCloneDialog } from '@/features/create-repo/create-repo-store'
import { createNewRepo, pickAndOpenRepo, type OpenRepoOutcome } from './use-repos'

function report(outcome: OpenRepoOutcome) {
  if (outcome.ok === false) toast.error(outcome.message)
}

export const repoActions = {
  open: () => void pickAndOpenRepo().then(report),
  clone: () => openCloneDialog(),
  create: () => void createNewRepo().then(report),
}
