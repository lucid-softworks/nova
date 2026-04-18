import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'

type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type PromptOptions = ConfirmOptions & {
  placeholder?: string
  defaultValue?: string
  multiline?: boolean
  maxLength?: number
}

type ConfirmCtx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  prompt: (opts: PromptOptions) => Promise<string | null>
}

const Ctx = createContext<ConfirmCtx | null>(null)

type PendingConfirm =
  | {
      kind: 'confirm'
      opts: ConfirmOptions
      resolve: (v: boolean) => void
    }
  | {
      kind: 'prompt'
      opts: PromptOptions
      resolve: (v: string | null) => void
    }

/**
 * Provider that renders a Radix Dialog and exposes promise-returning
 * confirm() / prompt() helpers. Replaces window.confirm and window.prompt
 * so destructive-action guards are styled and theme-consistent.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [promptValue, setPromptValue] = useState('')

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ kind: 'confirm', opts, resolve })
      }),
    [],
  )

  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(opts.defaultValue ?? '')
        setPending({ kind: 'prompt', opts, resolve })
      }),
    [],
  )

  const close = (result: boolean | string | null) => {
    if (!pending) return
    if (pending.kind === 'confirm') pending.resolve(result as boolean)
    else pending.resolve(result as string | null)
    setPending(null)
    setPromptValue('')
  }

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) close(pending?.kind === 'prompt' ? null : false)
        }}
      >
        {pending ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {pending.opts.destructive ? (
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                ) : null}
                {pending.opts.title ?? (pending.kind === 'prompt' ? 'Enter a value' : 'Are you sure?')}
              </DialogTitle>
              <DialogDescription>{pending.opts.message}</DialogDescription>
            </DialogHeader>
            {pending.kind === 'prompt' ? (
              pending.opts.multiline ? (
                <textarea
                  autoFocus
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  placeholder={pending.opts.placeholder}
                  maxLength={pending.opts.maxLength ?? 2000}
                  rows={4}
                  className="w-full resize-y rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <Input
                  autoFocus
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  placeholder={pending.opts.placeholder}
                  maxLength={pending.opts.maxLength ?? 500}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') close(promptValue)
                  }}
                />
              )
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(pending.kind === 'prompt' ? null : false)}>
                {pending.opts.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={pending.opts.destructive ? 'destructive' : 'default'}
                onClick={() => close(pending.kind === 'prompt' ? promptValue : true)}
              >
                {pending.opts.confirmLabel ?? (pending.opts.destructive ? 'Delete' : 'Confirm')}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </Ctx.Provider>
  )
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx.confirm
}

export function usePrompt(): (opts: PromptOptions) => Promise<string | null> {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePrompt must be used inside ConfirmProvider')
  return ctx.prompt
}
