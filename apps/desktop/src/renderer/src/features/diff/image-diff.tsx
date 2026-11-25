/**
 * Comparing two versions of an image, three ways:
 *
 * - Side by side: before and after next to each other, with their sizes.
 * - Swipe: the two stacked; drag the slider to wipe between them.
 * - Onion skin: the new image over the old one; the slider fades between
 *   them, which makes small shifts and colour changes stand out.
 *
 * The images come from main as base64 (repo:getImageDiff) and are shown as
 * data: URLs, which the app's Content Security Policy allows for images.
 * A checkerboard behind them makes transparent areas visible.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { DiffTarget, ImageVersion } from '@shared/ipc'
import { api } from '@/lib/api'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  svg: 'image/svg+xml',
}

const extension = (path: string) => path.slice(path.lastIndexOf('.') + 1).toLowerCase()

/** Whether the image diff can show this file. */
export function isImagePath(path: string): boolean {
  return extension(path) in MIME
}

type Mode = 'side' | 'swipe' | 'onion'
const MODES: { id: Mode; label: string }[] = [
  { id: 'side', label: 'Side by side' },
  { id: 'swipe', label: 'Swipe' },
  { id: 'onion', label: 'Onion skin' },
]

/** Transparent areas show as a light checkerboard. */
const CHECKERBOARD =
  'bg-[length:16px_16px] bg-[position:0_0,8px_8px] bg-[image:linear-gradient(45deg,var(--muted)_25%,transparent_25%,transparent_75%,var(--muted)_75%),linear-gradient(45deg,var(--muted)_25%,transparent_25%,transparent_75%,var(--muted)_75%)]'

export function ImageDiffView({ repoPath, target }: { repoPath: string; target: DiffTarget }) {
  const { data, error } = useQuery({
    queryKey: ['repo', repoPath, 'diff', 'image', target],
    queryFn: () => api.invoke('repo:getImageDiff', repoPath, target),
  })
  const [mode, setMode] = useState<Mode>('side')
  const [position, setPosition] = useState(50)
  const [sizes, setSizes] = useState<{ old?: string; new?: string }>({})

  if (error) return <p className="p-4 text-sm text-destructive">{error.message}</p>
  if (!data) return null
  const mime = MIME[extension(target.path)] ?? 'image/png'
  const url = (v: ImageVersion) => (v.kind === 'image' ? `data:${mime};base64,${v.base64}` : null)
  const before = url(data.old)
  const after = url(data.new)
  const tooLarge = data.old.kind === 'too-large' || data.new.kind === 'too-large'
  const both = before !== null && after !== null

  const describe = (v: ImageVersion, dimensions?: string) =>
    v.kind === 'image'
      ? `${dimensions ? `${dimensions}, ` : ''}${formatBytes(v.size)}`
      : v.kind === 'too-large'
        ? `too large to show (${formatBytes(v.size)})`
        : 'none'
  const measure = (side: 'old' | 'new') => (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setSizes((s) => ({ ...s, [side]: `${img.naturalWidth}×${img.naturalHeight}` }))
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="image-diff">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-3 py-1.5 text-xs">
        {both && (
          <div
            role="radiogroup"
            aria-label="Image comparison"
            className="flex rounded-md border p-0.5"
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  'rounded px-2 py-0.5',
                  mode === m.id
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        {both && mode !== 'side' && (
          <label className="flex items-center gap-2">
            {mode === 'swipe' ? 'Before' : 'Old'}
            <input
              type="range"
              min={0}
              max={100}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              aria-label={mode === 'swipe' ? 'Swipe position' : 'Opacity of the new image'}
            />
            {mode === 'swipe' ? 'After' : 'New'}
          </label>
        )}
        <span className="ml-auto text-muted-foreground">
          Before: {describe(data.old, sizes.old)} · After: {describe(data.new, sizes.new)}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {tooLarge && !both ? (
          <p className="text-center text-sm text-muted-foreground">
            The image is too large to show.
          </p>
        ) : !both || mode === 'side' ? (
          <div className="flex h-full items-start justify-center gap-4">
            {(['old', 'new'] as const).map((side) => {
              const src = side === 'old' ? before : after
              if (!src) return null
              return (
                <figure key={side} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <figcaption
                    className={cn(
                      'text-xs font-medium',
                      side === 'old' ? 'text-change-deleted' : 'text-change-added',
                    )}
                  >
                    {both
                      ? side === 'old'
                        ? 'Before'
                        : 'After'
                      : side === 'old'
                        ? 'Deleted'
                        : 'Added'}
                  </figcaption>
                  <img
                    src={src}
                    alt={`${target.path}, ${side === 'old' ? 'before' : 'after'}`}
                    onLoad={measure(side)}
                    className={cn('max-h-[70vh] max-w-full border object-contain', CHECKERBOARD)}
                  />
                </figure>
              )
            })}
          </div>
        ) : (
          // Both images in one box, the same size, so they line up.
          <div className={cn('relative mx-auto grid w-fit border', CHECKERBOARD)}>
            <img
              src={before!}
              alt={`${target.path}, before`}
              onLoad={measure('old')}
              className="col-start-1 row-start-1 max-h-[70vh] max-w-full object-contain"
            />
            <img
              src={after!}
              alt={`${target.path}, after`}
              onLoad={measure('new')}
              className="col-start-1 row-start-1 max-h-[70vh] max-w-full object-contain"
              style={
                mode === 'swipe'
                  ? // The new image shows left of the handle, the old one right of it.
                    { clipPath: `inset(0 ${100 - position}% 0 0)` }
                  : { opacity: position / 100 }
              }
            />
            {mode === 'swipe' && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-brand"
                style={{ left: `${position}%` }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
