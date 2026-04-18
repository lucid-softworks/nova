import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Check, X, LinkIcon, Copy, Trash2, UserPlus } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { useConfirm, usePrompt } from '~/components/ui/confirm'
import { Spinner } from '~/components/ui/spinner'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '~/components/ui/dialog'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { PLATFORMS } from '~/lib/platforms'
import { listPosts, type PostRow } from '~/server/posts'
import { approvePost, requestChanges } from '~/server/scheduling'
import {
  createApprovalToken,
  listApprovalTokens,
  revokeApprovalToken,
} from '~/server/approvalPortal'
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
    tokens: await listApprovalTokens({ data: { workspaceSlug: params.workspaceSlug } }),
  }),
  component: ApprovalsPage,
})

function ApprovalsPage() {
  const t = useT()
  const confirm = useConfirm()
  const prompt = usePrompt()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData() as { rows: PostRow[]; tokens: Array<{ id: string; email: string; name: string | null; token: string; expiresAt: Date | string; createdAt: Date | string }> }
  const [rows, setRows] = useState<PostRow[]>(initial.rows)
  const [tokens, setTokens] = useState(initial.tokens)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)

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

  const reloadTokens = async () => {
    const t = await listApprovalTokens({ data: { workspaceSlug } })
    setTokens(t as typeof tokens)
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
    const note = await prompt({
      message: t('approvals.whatNeedsToChange2'),
      multiline: true,
    })
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

  const handleRevoke = async (tokenId: string) => {
    const ok = await confirm({
      message: t('approvals.revokeConfirm'),
      destructive: true,
    })
    if (!ok) return
    await revokeApprovalToken({ data: { workspaceSlug, tokenId } })
    await reloadTokens()
  }

  return (
    <div className="space-y-6">
      {/* Header + post table */}
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
            <Button variant="outline" size="sm" onClick={() => setShowInvite(true)}>
              <UserPlus className="h-3 w-3" /> {t('approvals.inviteReviewer')}
            </Button>
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

      {/* Review links section */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {t('approvals.activeLinks')}
        </h3>
        {tokens.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('approvals.noLinks')}</p>
        ) : (
          <Card>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {tokens.map((tk) => (
                <div key={tk.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {tk.name ?? tk.email}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {tk.email} &middot; expires {new Date(tk.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevoke(tk.id)}
                  >
                    <Trash2 className="h-3 w-3" /> {t('approvals.revoke')}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Invite dialog */}
      <InviteReviewerDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        workspaceSlug={workspaceSlug}
        onCreated={reloadTokens}
      />
    </div>
  )
}

function InviteReviewerDialog({
  open,
  onOpenChange,
  workspaceSlug,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceSlug: string
  onCreated: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Body renders only while open, so local state is fresh every time. */}
      {open ? <InviteReviewerBody workspaceSlug={workspaceSlug} onCreated={onCreated} /> : null}
    </Dialog>
  )
}

function InviteReviewerBody({
  workspaceSlug,
  onCreated,
}: {
  workspaceSlug: string
  onCreated: () => void
}) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [days, setDays] = useState(7)
  const [creating, setCreating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    try {
      const result = await createApprovalToken({
        data: {
          workspaceSlug,
          email,
          name: name || undefined,
          expiresInDays: days,
        },
      })
      setGeneratedUrl(result.url)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const copyUrl = async () => {
    if (!generatedUrl) return
    await navigator.clipboard.writeText(generatedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('approvals.inviteReviewer')}</DialogTitle>
        <DialogDescription>{t('approvals.description')}</DialogDescription>
      </DialogHeader>

      {generatedUrl ? (
        <div className="space-y-3">
          <Label>{t('approvals.copyLink')}</Label>
          <div className="flex gap-2">
            <Input readOnly value={generatedUrl} className="flex-1 text-xs" />
            <Button size="sm" variant="outline" onClick={copyUrl}>
              <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rev-email">{t('approvals.reviewerEmail')}</Label>
            <Input
              id="rev-email"
              type="email"
              placeholder="client@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rev-name">{t('approvals.reviewerName')}</Label>
            <Input
              id="rev-name"
              placeholder={t('approvals.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('approvals.expiresIn')}</Label>
            <div className="flex gap-2">
              {[7, 14, 30].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={days === d ? 'default' : 'outline'}
                  onClick={() => setDays(d)}
                >
                  {d} {t('approvals.days')}
                </Button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button onClick={handleCreate} disabled={!email || creating} className="w-full">
            {creating ? <Spinner /> : <LinkIcon className="h-3.5 w-3.5" />} {t('approvals.createLink')}
          </Button>
        </div>
      )}
    </DialogContent>
  )
}
