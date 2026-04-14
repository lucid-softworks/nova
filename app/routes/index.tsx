import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionContext } from '~/server/auth-context'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const ctx = await getSessionContext()
    if (!ctx.user) throw redirect({ to: '/login' })
    if (ctx.workspaces.length === 0) throw redirect({ to: '/onboarding' })
    const first = ctx.workspaces[0]!
    throw redirect({ to: '/$workspaceSlug/compose', params: { workspaceSlug: first.slug } })
  },
})
