/**
 * The pick list a plugin shows with trellis.ui.showQuickPick(): a
 * searchable list like the command palette. Mounted once in app.tsx;
 * opened with quickPick(), which resolves to the chosen index (or undefined
 * if dismissed).
 */
import { create } from 'zustand'
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

interface QuickPickRequest {
  items: { label: string; detail?: string }[]
  placeholder?: string
  resolve: (index: number | undefined) => void
}

const useQuickPickStore = create<{ request: QuickPickRequest | null }>(() => ({ request: null }))

export function quickPick(
  items: QuickPickRequest['items'],
  placeholder?: string,
): Promise<number | undefined> {
  return new Promise((resolve) => {
    // Only one at a time: a new request cancels the previous one.
    useQuickPickStore.getState().request?.resolve(undefined)
    useQuickPickStore.setState({
      request: { items, resolve, ...(placeholder ? { placeholder } : {}) },
    })
  })
}

export function QuickPickDialog() {
  const request = useQuickPickStore((s) => s.request)
  const finish = (index: number | undefined) => {
    request?.resolve(index)
    useQuickPickStore.setState({ request: null })
  }
  return (
    <CommandDialog
      open={request !== null}
      onOpenChange={(open) => !open && finish(undefined)}
      title="Choose"
      description={request?.placeholder ?? 'Choose an item'}
    >
      <CommandInput placeholder={request?.placeholder ?? 'Type to search…'} />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {request?.items.map((item, index) => (
          // The index keeps items with the same label distinct.
          <CommandItem
            key={index}
            value={`${item.label} ${item.detail ?? ''} ${index}`}
            onSelect={() => finish(index)}
          >
            <span>{item.label}</span>
            {item.detail && (
              <span className="ml-2 truncate text-xs text-muted-foreground">{item.detail}</span>
            )}
          </CommandItem>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
