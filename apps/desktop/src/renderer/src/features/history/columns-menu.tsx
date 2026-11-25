/**
 * Choosing the history list's columns: a "Columns" button for the toolbar,
 * and a right-click menu for the column headers. Both edit the
 * `historyColumns` setting (see columns.ts).
 */
import { Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useSettingsStore } from '@/features/settings/settings-store'
import { COLUMNS, toggleColumn } from './columns'

function useColumnSelection() {
  const selected = useSettingsStore((s) => s.settings.historyColumns)
  const update = useSettingsStore((s) => s.update)
  return {
    isOn: (id: (typeof COLUMNS)[number]['id']) => selected.includes(id),
    toggle: (id: (typeof COLUMNS)[number]['id']) =>
      update({ historyColumns: toggleColumn(selected, id) }),
  }
}

/** "Columns" button with a checklist of the optional columns. */
export function ColumnsDropdown() {
  const { isOn, toggle } = useColumnSelection()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label="Columns"
          title="Choose columns"
        >
          <Columns3 />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        {COLUMNS.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={isOn(column.id)}
            onCheckedChange={() => toggle(column.id)}
            // Keep the menu open so several columns can be changed at once.
            onSelect={(event) => event.preventDefault()}
            title={column.hint}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Right-click menu for the column headers, with the same checklist. */
export function ColumnsContextMenu({ children }: { children: React.ReactNode }) {
  const { isOn, toggle } = useColumnSelection()
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>Columns</ContextMenuLabel>
        {COLUMNS.map((column) => (
          <ContextMenuCheckboxItem
            key={column.id}
            checked={isOn(column.id)}
            onCheckedChange={() => toggle(column.id)}
            onSelect={(event) => event.preventDefault()}
            title={column.hint}
          >
            {column.label}
          </ContextMenuCheckboxItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
