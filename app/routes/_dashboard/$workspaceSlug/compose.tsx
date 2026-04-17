import { createFileRoute } from '@tanstack/react-router'
import { listAccounts } from '~/server/accounts'
import { getWorkspaceApproval } from '~/server/team'
import { loadPostForComposer, type LoadedPost } from '~/server/composer'
import { ComposerPage } from '~/components/composer/ComposerPage'

type ComposeSearch = {
  postId?: string
  scheduledAt?: string
  replyTo?: string
  replyHandle?: string
  replyAccountId?: string
  quoteTo?: string
  quoteHandle?: string
  quoteAccountId?: string
}

export const Route = createFileRoute('/_dashboard/$workspaceSlug/compose')({
  validateSearch: (s: Record<string, unknown>): ComposeSearch => {
    const out: ComposeSearch = {}
    if (typeof s.postId === 'string') out.postId = s.postId
    if (typeof s.scheduledAt === 'string') out.scheduledAt = s.scheduledAt
    if (typeof s.replyTo === 'string') out.replyTo = s.replyTo
    if (typeof s.replyHandle === 'string') out.replyHandle = s.replyHandle
    if (typeof s.replyAccountId === 'string') out.replyAccountId = s.replyAccountId
    if (typeof s.quoteTo === 'string') out.quoteTo = s.quoteTo
    if (typeof s.quoteHandle === 'string') out.quoteHandle = s.quoteHandle
    if (typeof s.quoteAccountId === 'string') out.quoteAccountId = s.quoteAccountId
    return out
  },
  loaderDeps: ({ search }) => ({ postId: search.postId }),
  loader: async ({ params, deps }) => {
    const [accounts, approval] = await Promise.all([
      listAccounts({ data: { workspaceSlug: params.workspaceSlug } }),
      getWorkspaceApproval({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    let existing: LoadedPost | null = null
    if (deps.postId) {
      try {
        existing = await loadPostForComposer({
          data: { workspaceSlug: params.workspaceSlug, postId: deps.postId },
        })
      } catch {
        existing = null
      }
    }
    return {
      accounts: accounts.filter((a) => a.status === 'connected'),
      requireApproval: approval.requireApproval,
      existing,
    }
  },
  component: ComposeRoute,
})

function ComposeRoute() {
  const { workspaceSlug } = Route.useParams()
  const { workspace } = Route.useRouteContext()
  const { accounts, requireApproval, existing } = Route.useLoaderData()
  const {
    scheduledAt,
    replyTo,
    replyHandle,
    replyAccountId,
    quoteTo,
    quoteHandle,
    quoteAccountId,
  } = Route.useSearch()
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
      existing={existing}
      initialScheduledAt={scheduledAt ?? null}
      reply={
        replyTo
          ? {
              replyTo,
              handle: replyHandle ?? '',
              accountId: replyAccountId ?? null,
            }
          : null
      }
      quote={
        quoteTo
          ? {
              quoteTo,
              handle: quoteHandle ?? '',
              accountId: quoteAccountId ?? null,
            }
          : null
      }
    />
  )
}
