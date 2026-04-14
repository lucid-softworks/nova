import { createFileRoute } from '@tanstack/react-router'
import { listAccounts } from '~/server/accounts'
import { ComposerPage } from '~/components/composer/ComposerPage'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/compose')({
  loader: async ({ params }) => {
    const accounts = await listAccounts({ data: { workspaceSlug: params.workspaceSlug } })
    return { accounts: accounts.filter((a) => a.status === 'connected') }
  },
  component: ComposeRoute,
})

function ComposeRoute() {
  const { workspaceSlug } = Route.useParams()
  const { accounts } = Route.useLoaderData()
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
    />
  )
}
