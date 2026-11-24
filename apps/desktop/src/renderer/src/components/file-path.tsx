/**
 * Shows a file path with the file name emphasised and the folder dimmed,
 * truncating the folder first when space is short, e.g. "src/lib/ utils.ts".
 */
import { splitPath } from '@/lib/format'
import { cn } from '@/lib/utils'

export function FilePath({
  path,
  oldPath,
  className,
}: {
  path: string
  oldPath?: string
  className?: string
}) {
  const { dir, name } = splitPath(path)
  return (
    <span
      className={cn('flex min-w-0 items-baseline', className)}
      title={oldPath ? `${oldPath} → ${path}` : path}
    >
      <span className="shrink-0">{name}</span>
      {dir && <span className="ml-1.5 truncate text-xs text-muted-foreground">{dir}</span>}
    </span>
  )
}
