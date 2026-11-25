/**
 * Form rows used in the Settings dialog: a labelled Field (with optional
 * help text) and a plain Select.
 */
import { Label } from '@/components/ui/label'

export function Field(props: {
  id: string
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-start gap-3">
      <Label htmlFor={props.id} className="pt-2">
        {props.label}
      </Label>
      <div className="space-y-1">
        {props.children}
        {props.help && <p className="text-xs text-muted-foreground">{props.help}</p>}
      </div>
    </div>
  )
}

export function Select(props: {
  id: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      id={props.id}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
