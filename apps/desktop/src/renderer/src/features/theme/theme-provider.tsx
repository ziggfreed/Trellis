/**
 * Applies the light/dark theme by toggling the `dark` class on <html>.
 * "system" follows the operating system setting and updates live when it changes.
 */
import { useEffect } from 'react'
import type { ThemePreference } from '@shared/ipc'
import { useSettingsStore } from '@/features/settings/settings-store'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function applyTheme(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && darkQuery().matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.settings.theme)

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const query = darkQuery()
    const onChange = () => applyTheme('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [theme])

  return <>{children}</>
}
