import { createFileRoute } from '@tanstack/react-router'
import { listAccounts } from '~/server/accounts'
import { getWorkspaceApproval } from '~/server/team'
import { ComposerPage } from '~/components/composer/ComposerPage'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/compose')({
  loader: async ({ params }) => {
    const [accounts, approval] = await Promise.all([
      listAccounts({ data: { workspaceSlug: params.workspaceSlug } }),
      getWorkspaceApproval({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    return {
      accounts: accounts.filter((a) => a.status === 'connected'),
      requireApproval: approval.requireApproval,
    }
  },
  component: ComposeRoute,
})

function ComposeRoute() {
  const { workspaceSlug } = Route.useParams()
  const { workspace } = Route.useRouteContext()
  const { accounts, requireApproval } = Route.useLoaderData()
  return (
    <ComposerPage
      workspaceSlug={workspaceSlug}
      accounts={accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        accountName: a.accountName,
        accountHandle: a.accountHandle,
        avatarUrl: a.avatarUrl,
      }))}
      userRole={workspace.role}
      requireApproval={requireApproval}
    />
  )
}
