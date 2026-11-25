/**
 * Root component. On start-up it:
 *   1. loads saved settings (theme, open tabs),
 *   2. checks git is installed,
 * then shows either the main window layout or the "git missing" screen.
 */
import { useCallback, useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import type { GitInstallation } from '@shared/ipc'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query-client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TabBar } from '@/components/layout/tab-bar'
import { StatusBar } from '@/components/layout/status-bar'
import { ThemeProvider } from '@/features/theme/theme-provider'
import { useSettingsStore } from '@/features/settings/settings-store'
import { useRepos } from '@/features/repos/use-repos'
import { useRepoSync } from '@/features/repos/use-repo-sync'
import { HomeScreen } from '@/features/home/home-screen'
import { RepoView } from '@/features/repo-view/repo-view'
import { GitMissingScreen } from '@/features/git-check/git-missing-screen'
import { CloneDialog } from '@/features/create-repo/clone-dialog'
import { CompareDialog } from '@/features/compare/compare-dialog'
import { ScanDialog } from '@/features/home/scan-dialog'
import { Dialogs } from '@/features/dialogs/dialogs'
import { AuthPrompt } from '@/features/auth/auth-prompt'
import { CommandPalette } from '@/features/command-palette/command-palette'
import { RebaseDialog } from '@/features/rebase/rebase-dialog'
import { DropMenu } from '@/features/drag-drop/drop-menu'
import { SettingsDialog } from '@/features/settings/settings-dialog'
import { CommandLogPanel } from '@/features/command-log/command-log-panel'
import { useCommandLogStore } from '@/features/command-log/command-log-store'
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
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  )
}

function MainLayout({ gitVersion }: { gitVersion: string }) {
  const { activeRepo } = useRepos()
  useKeyboardShortcuts()
  useRepoSync()
  const connectCommandLog = useCommandLogStore((s) => s.connect)
  useEffect(() => connectCommandLog(), [connectCommandLog])

  return (
    <div className="flex h-full flex-col">
      <TabBar />
      <div className="min-h-0 flex-1">
        {/* `key` gives each repo a fresh view, so state never leaks between tabs. */}
        {activeRepo ? <RepoView key={activeRepo.path} repo={activeRepo} /> : <HomeScreen />}
      </div>
      <CommandLogPanel />
      <StatusBar gitVersion={gitVersion} repoPath={activeRepo?.path ?? null} />
      <CloneDialog />
      <CompareDialog />
      <ScanDialog />
      <Dialogs />
      <AuthPrompt />
      <CommandPalette />
      <RebaseDialog />
      <DropMenu />
      <SettingsDialog />
    </div>
  )
}
