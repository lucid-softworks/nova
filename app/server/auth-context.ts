import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export type { SessionUser, WorkspaceSummary, SessionContext } from './types'

// Lazy import so the server-only `session.server` module never appears in
// the client's static import graph. Import-protection otherwise trips on
// Vite's production build, even though the handler is stripped client-side.
export const getSessionContext = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadSessionContext } = await import('./session.server')
  return loadSessionContext()
})

const setActiveInput = z.object({ slug: z.string().min(1) })

export const setActiveWorkspace = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => setActiveInput.parse(d))
  .handler(async ({ data }) => {
    const { setActiveWorkspaceImpl } = await import('./session.server')
    await setActiveWorkspaceImpl(data.slug)
    return { ok: true as const }
  })
