import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getSessionContext, type SessionContext } from '~/server/auth-context'
import { RouteErrorBoundary } from '~/components/RouteErrorBoundary'

export const Route = createFileRoute('/_dashboard')({
  beforeLoad: async (): Promise<{ session: SessionContext }> => {
    const session = await getSessionContext()
    if (!session.user) throw redirect({ to: '/login' })
    if (session.workspaces.length === 0) throw redirect({ to: '/onboarding' })
    return { session }
  },
  component: () => <Outlet />,
  errorComponent: RouteErrorBoundary,
})
