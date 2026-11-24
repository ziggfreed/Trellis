/** The thin bar along the bottom: git version, current branch and theme switcher. */
import { GitBranch, Monitor, Moon, Sun } from 'lucide-react'
import type { ThemePreference } from '@shared/ipc'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSettingsStore } from '@/features/settings/settings-store'

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const

interface StatusBarProps {
  gitVersion: string | null
  branch: string | null
}

export function StatusBar({ gitVersion, branch }: StatusBarProps) {
  const theme = useSettingsStore((s) => s.settings.theme)
  const update = useSettingsStore((s) => s.update)
  const ThemeIcon = THEME_ICONS[theme]

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t bg-sidebar px-3 text-xs text-muted-foreground">
      {branch && (
        <span className="flex items-center gap-1" data-testid="status-branch">
          <GitBranch className="size-3.5" />
          {branch}
        </span>
      )}
      <span className="ml-auto">{gitVersion}</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 capitalize hover:text-foreground">
          <ThemeIcon className="size-3.5" />
          {theme}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => update({ theme: value as ThemePreference })}
          >
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </footer>
  )
}
