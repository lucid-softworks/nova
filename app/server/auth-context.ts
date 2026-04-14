import { createServerFn } from '@tanstack/react-start'
import { loadSessionContext } from './session.server'

export type { SessionUser, WorkspaceSummary, SessionContext } from './types'

export const getSessionContext = createServerFn({ method: 'GET' }).handler(loadSessionContext)
