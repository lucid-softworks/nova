import { createServerFn } from '@tanstack/react-start'
import { loadSessionContext } from './session'

export type { SessionUser, WorkspaceSummary, SessionContext } from './session'
export { loadSessionContext, requireWorkspaceAccess } from './session'

export const getSessionContext = createServerFn({ method: 'GET' }).handler(loadSessionContext)
