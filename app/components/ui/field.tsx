import * as React from 'react'
import { cn } from '~/lib/utils'
import { Label } from './label'

export interface FieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
}

export function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p> : null}
    </div>
  )
}
