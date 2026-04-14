import { createServerFn } from '@tanstack/react-start'

export type { SessionUser, WorkspaceSummary, SessionContext } from './types'

// Lazy import so the server-only `session.server` module never appears in
// the client's static import graph. Import-protection otherwise trips on
// Vite's production build, even though the handler is stripped client-side.
export const getSessionContext = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadSessionContext } = await import('./session.server')
  return loadSessionContext()
})
