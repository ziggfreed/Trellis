/** Renders the current confirm or text dialog from the dialog store. Mount once. */
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDialogStore, type DialogRequest } from './dialog-store'

export function Dialogs() {
  const current = useDialogStore((s) => s.current)
  const close = useDialogStore((s) => s.close)

  const cancel = () => {
    current?.resolve(null)
    close()
  }

  return (
    <Dialog open={current !== null} onOpenChange={(open) => !open && cancel()}>
      {/* `key` remounts the form for each new dialog, resetting its fields. */}
      {current && (
        <DialogForm key={current.id} request={current} onDone={close} onCancel={cancel} />
      )}
    </Dialog>
  )
}

function DialogForm({
  request,
  onDone,
  onCancel,
}: {
  request: DialogRequest
  onDone: () => void
  onCancel: () => void
}) {
  const { options } = request
  const isText = request.kind === 'text'
  const textOptions = isText ? request.options : null
  const [value, setValue] = useState(textOptions?.initialValue ?? '')
  const [checked, setChecked] = useState(options.checkbox?.defaultChecked ?? false)
  const [touched, setTouched] = useState(false)

  const error = textOptions?.validate?.(value) ?? null
  const empty = isText && !textOptions!.optional && value.trim() === ''
  const canSubmit = !error && !empty

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!canSubmit) return
    if (request.kind === 'text') request.resolve({ value, checked })
    else request.resolve({ checked })
    onDone()
  }

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{options.title}</DialogTitle>
          {options.description && (
            <DialogDescription className="whitespace-pre-line">
              {options.description}
            </DialogDescription>
          )}
        </DialogHeader>

        {textOptions && (
          <div className="space-y-2">
            <Label htmlFor="dialog-input">{textOptions.label}</Label>
            {textOptions.multiline ? (
              <textarea
                id="dialog-input"
                autoFocus
                rows={4}
                value={value}
                placeholder={textOptions.placeholder}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            ) : (
              <Input
                id="dialog-input"
                autoFocus
                value={value}
                placeholder={textOptions.placeholder}
                aria-invalid={touched && error !== null}
                onChange={(e) => {
                  setValue(e.target.value)
                  setTouched(true)
                }}
              />
            )}
            {touched && error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        {options.checkbox && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {options.checkbox.label}
          </label>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={
              request.kind === 'confirm' && request.options.destructive ? 'destructive' : 'default'
            }
            disabled={isText && !canSubmit && touched}
            autoFocus={!isText}
          >
            {options.confirmLabel ?? 'OK'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
