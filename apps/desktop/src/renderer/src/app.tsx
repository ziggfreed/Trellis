/**
 * Root component. On start-up it:
 *   1. loads saved settings (theme, open tabs),
 *   2. checks git is installed,
 * then shows either the main window layout or the "git missing" screen.
 */
import { useCallback, useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import type { GitInstallation } from '@shared/ipc'
import { api } from '@/lib/api'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TabBar } from '@/components/layout/tab-bar'
import { StatusBar } from '@/components/layout/status-bar'
import { ThemeProvider } from '@/features/theme/theme-provider'
import { useSettingsStore } from '@/features/settings/settings-store'
import { useRepos } from '@/features/repos/use-repos'
import { describeHead, useRepoSummary } from '@/features/repos/use-repo-summary'
import { HomeScreen } from '@/features/home/home-screen'
import { RepoView } from '@/features/repo-view/repo-view'
import { GitMissingScreen } from '@/features/git-check/git-missing-screen'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'

export function App() {
  const loaded = useSettingsStore((s) => s.loaded)
  const load = useSettingsStore((s) => s.load)
  const [git, setGit] = useState<GitInstallation | null>(null)

  const checkGit = useCallback(() => {
    void api.invoke('git:checkInstallation').then(setGit)
  }, [])

  useEffect(() => {
    void load()
    checkGit()
  }, [load, checkGit])

  // Render nothing until ready; this takes a few milliseconds.
  if (!loaded || !git) return null

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={400}>
        {git.status === 'ok' ? (
          <MainLayout gitVersion={git.version.raw} />
        ) : (
          <GitMissingScreen installation={git} onRetry={checkGit} />
        )}
        <Toaster position="bottom-right" richColors />
      </TooltipProvider>
    </ThemeProvider>
  )
}

function MainLayout({ gitVersion }: { gitVersion: string }) {
  const { activeRepo } = useRepos()
  const { summary } = useRepoSummary(activeRepo?.path ?? null)
  useKeyboardShortcuts()

  return (
    <div className="flex h-full flex-col">
      <TabBar />
      <div className="min-h-0 flex-1">
        {/* `key` gives each repo a fresh view, so state never leaks between tabs. */}
        {activeRepo ? <RepoView key={activeRepo.path} repo={activeRepo} /> : <HomeScreen />}
      </div>
      <StatusBar gitVersion={gitVersion} branch={activeRepo ? describeHead(summary) : null} />
    </div>
  )
}
