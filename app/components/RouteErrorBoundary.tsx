import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { AlertTriangle, Home, RotateCw } from 'lucide-react'
import { Button } from '~/components/ui/button'

const SHOW_STACK = import.meta.env.DEV

/**
 * Default fallback for route-level exceptions. TanStack Router calls this
 * whenever a loader throws or a component crashes during render under
 * the associated route. Keep the UI minimal — the failure could be from
 * the session loader itself, so we avoid anything that re-enters the
 * data layer.
 */
export function RouteErrorBoundary({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-neutral-900 p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-5 w-5" />
          <h1 className="text-base font-semibold">Something went wrong</h1>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          This page hit an error while loading. Retrying often works — if it keeps failing,
          head back to the dashboard and try again from there.
        </p>
        {SHOW_STACK ? (
          <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-neutral-100 dark:bg-neutral-950 p-3 text-xs text-neutral-700 dark:text-neutral-300">
            {error instanceof Error ? (error.stack ?? error.message) : String(error)}
          </pre>
        ) : (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Error: {error instanceof Error ? error.message : String(error)}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={reset}>
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/">
              <Home className="h-3.5 w-3.5" /> Go home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
