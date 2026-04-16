import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { listPosts, type PostRow } from '~/server/posts'
import { approvePost, requestChanges } from '~/server/scheduling'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/approvals')({
  beforeLoad: ({ context }) => {
    const ctx = context as { workspace: { role: string } }
    if (ctx.workspace.role !== 'admin' && ctx.workspace.role !== 'manager') {
      throw redirect({ to: '/$workspaceSlug/posts', params: { workspaceSlug: '' } as never })
    }
  },
  loader: async ({ params }) => ({
    rows: await listPosts({
      data: {
        workspaceSlug: params.workspaceSlug,
        tab: 'pending_approval',
        search: null,
        platforms: [],
        type: 'all',
        authorId: null,
        fromIso: null,
        toIso: null,
      },
    }),
  }),
  component: ApprovalsPage,
})

function ApprovalsPage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData() as { rows: PostRow[] }
  const [rows, setRows] = useState<PostRow[]>(initial.rows)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }

  const reload = async () => {
    const next = await listPosts({
      data: {
        workspaceSlug,
        tab: 'pending_approval',
        search: null,
        platforms: [],
        type: 'all',
        authorId: null,
        fromIso: null,
        toIso: null,
      },
    })
    setRows(next)
    setSelected(new Set())
  }

  const approveSelected = async () => {
    if (selected.size === 0) return
    setBusy('approve')
    setError(null)
    try {
      for (const id of selected) {
        await approvePost({ data: { workspaceSlug, postId: id, scheduledAt: null } })
      }
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setBusy(null)
    }
  }

  const rejectSelected = async () => {
    if (selected.size === 0) return
    const note = prompt(t('approvals.whatNeedsToChange2'))
    if (!note) return
    setBusy('reject')
    setError(null)
    try {
      for (const id of selected) {
        await requestChanges({ data: { workspaceSlug, postId: id, note } })
      }
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {t('approvals.title')}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('approvals.postsAwaitingReview')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {t('approvals.selected', { count: selected.size })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={rejectSelected}
            disabled={selected.size === 0 || busy !== null}
          >
            {busy === 'reject' ? <Spinner /> : <X className="h-3 w-3" />} {t('approvals.requestChanges')}
          </Button>
          <Button size="sm" onClick={approveSelected} disabled={selected.size === 0 || busy !== null}>
            {busy === 'approve' ? <Spinner /> : <Check className="h-3 w-3" />} {t('approvals.approve')}
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Card>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
            {t('approvals.nothingToApproveNow')}{' '}
            <Link
              to="/$workspaceSlug/posts"
              params={{ workspaceSlug }}
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {t('approvals.backToPosts')}
            </Link>
            .
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <tr>
                <th className="px-3 py-2">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left">{t('approvals.post')}</th>
                <th className="px-3 py-2 text-left">{t('approvals.author')}</th>
                <th className="px-3 py-2 text-left">{t('approvals.targets')}</th>
                <th className="px-3 py-2 text-left">{t('approvals.submitted')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Link
                      to="/$workspaceSlug/compose"
                      params={{ workspaceSlug }}
                      search={{ postId: r.id } as never}
                      className="text-neutral-900 hover:underline dark:text-neutral-100"
                    >
                      {r.defaultContent ? r.defaultContent.slice(0, 120) : t('approvals.noContent')}
                    </Link>
                  </td>
                  <td className="px-3 py-2 align-top text-neutral-600 dark:text-neutral-300">
                    {r.authorName ?? '—'}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-1">
                      {[...new Set((r.platforms ?? []).map((p) => p.platform))].map((p) => (
                        <span
                          key={p}
                          title={PLATFORMS[p]?.label ?? p}
                          className="inline-flex"
                        >
                          <PlatformIcon platform={p} size={16} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-neutral-500 dark:text-neutral-400">
                    {new Date(r.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
