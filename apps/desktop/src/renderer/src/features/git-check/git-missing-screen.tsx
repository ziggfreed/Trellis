/** Shown instead of the app when git is missing or too old. Trellis needs git installed. */
import { TriangleAlert } from 'lucide-react'
import type { GitInstallation } from '@shared/ipc'
import { Button } from '@/components/ui/button'

const MIN_VERSION = '2.34'

export function GitMissingScreen({
  installation,
  onRetry,
}: {
  installation: Exclude<GitInstallation, { status: 'ok' }>
  onRetry: () => void
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md space-y-4 text-center">
        <TriangleAlert className="mx-auto size-10 text-destructive" />
        {installation.status === 'not-installed' ? (
          <>
            <h1 className="text-xl font-semibold">Git is not installed</h1>
            <p className="text-sm text-muted-foreground">
              Trellis uses the git program installed on your computer. Install git {MIN_VERSION} or
              newer, make sure it is on your PATH, then try again.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Git is out of date</h1>
            <p className="text-sm text-muted-foreground">
              Trellis needs git {MIN_VERSION} or newer. You have {installation.version.raw}.
            </p>
          </>
        )}
        <div className="flex justify-center gap-2">
          <Button asChild variant="outline">
            <a href="https://git-scm.com/downloads" target="_blank" rel="noreferrer">
              Download git
            </a>
          </Button>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      </div>
    </div>
  )
}
