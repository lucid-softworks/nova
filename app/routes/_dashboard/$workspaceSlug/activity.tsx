import { createFileRoute, Link } from '@tanstack/react-router'
import { Card } from '~/components/ui/card'
import { listWorkspaceActivity, type WorkspaceActivityRow } from '~/server/posts'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/activity')({
  loader: async ({ params }) => ({
    activity: await listWorkspaceActivity({ data: { workspaceSlug: params.workspaceSlug } }),
  }),
  component: ActivityPage,
})

const ACTION_LABELS: Record<string, string> = {
  created: 'created',
  updated: 'edited',
  scheduled: 'scheduled',
  published: 'published',
  cancelled: 'cancelled',
  approved: 'approved',
  rejected: 'rejected',
  deleted: 'deleted',
  retried: 'retried',
  failed: 'failed',
}

function labelFor(action: string): string {
  return ACTION_LABELS[action] ?? action
}

function ActivityPage() {
  const { workspaceSlug } = Route.useParams()
  const { activity } = Route.useLoaderData() as { activity: WorkspaceActivityRow[] }
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900">Activity</h2>
        <p className="text-sm text-neutral-500">Recent changes across your workspace.</p>
      </div>
      <Card>
        {activity.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="text-neutral-900">
                    <span className="font-medium">{a.userName ?? 'Someone'}</span>{' '}
                    <span className="text-neutral-500">{labelFor(a.action)}</span>{' '}
                    <Link
                      to="/$workspaceSlug/compose"
                      params={{ workspaceSlug }}
                      search={{ postId: a.postId } as never}
                      className="text-indigo-600 hover:underline"
                    >
                      a post
                    </Link>
                    {a.note ? <span className="text-neutral-500"> — {a.note}</span> : null}
                  </div>
                  {a.postContent ? (
                    <div className="mt-0.5 truncate text-xs text-neutral-500">
                      “{a.postContent}”
                    </div>
                  ) : null}
                </div>
                <time className="whitespace-nowrap text-xs text-neutral-400">
                  {new Date(a.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
