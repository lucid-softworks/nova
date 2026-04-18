import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Check, MessageSquare, AlertCircle } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import {
  getReviewContext,
  approvePostViaToken,
  requestChangesViaToken,
  type ReviewContext,
  type ReviewPost,
} from '~/server/approvalPortal'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/review/$token')({
  loader: async ({ params }) => {
    const result = await getReviewContext({ data: { token: params.token } })
    return { result, token: params.token }
  },
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: ReviewPage,
})

function ReviewPage() {
  const t = useT()
  const { result, token } = Route.useLoaderData()

  if (!result.ok) {
    return (
      <ReviewShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-red-400" />
          <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-100">
            {result.reason === 'expired' ? t('review.expiredToken') : t('review.invalidToken')}
          </h2>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {result.reason === 'expired'
              ? 'This review link has expired. Please ask the team for a new one.'
              : 'This review link is not valid. Please check the URL or request a new link.'}
          </p>
        </div>
      </ReviewShell>
    )
  }

  return <ReviewContent data={result.data} token={token} />
}

function ReviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 py-10">{children}</div>
    </div>
  )
}

function ReviewContent({ data, token }: { data: ReviewContext; token: string }) {
  const t = useT()
  const [posts, setPosts] = useState(data.posts)
  const [actionState, setActionState] = useState<Record<string, 'approved' | 'changes_requested'>>({})

  if (posts.length === 0) {
    return (
      <ReviewShell>
        <Header workspaceName={data.workspaceName} />
        <div className="mt-10 flex flex-col items-center py-16 text-center">
          <Check className="mb-4 h-12 w-12 text-green-400" />
          <p className="text-lg text-neutral-600 dark:text-neutral-300">{t('review.noPendingPosts')}</p>
        </div>
      </ReviewShell>
    )
  }

  return (
    <ReviewShell>
      <Header workspaceName={data.workspaceName} />
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {t('review.description')}
      </p>
      <div className="mt-8 space-y-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            token={token}
            state={actionState[post.id]}
            onAction={(postId, state) => {
              setActionState((prev) => ({ ...prev, [postId]: state }))
              if (state === 'approved') {
                setPosts((prev) => prev.filter((p) => p.id !== postId))
              }
            }}
          />
        ))}
      </div>
    </ReviewShell>
  )
}

function Header({ workspaceName }: { workspaceName: string }) {
  const t = useT()
  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
        {t('review.title')}
      </h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{workspaceName}</p>
    </div>
  )
}

function PostCard({
  post,
  token,
  state,
  onAction,
}: {
  post: ReviewPost
  token: string
  state?: 'approved' | 'changes_requested'
  onAction: (postId: string, state: 'approved' | 'changes_requested') => void
}) {
  const t = useT()
  const [busy, setBusy] = useState<'approve' | 'changes' | null>(null)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (state === 'approved') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950/30">
        <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
          <Check className="h-4 w-4" /> {t('review.approved')}
        </p>
      </div>
    )
  }

  if (state === 'changes_requested') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          <MessageSquare className="h-4 w-4" /> {t('review.changesRequested')}
        </p>
      </div>
    )
  }

  const handleApprove = async () => {
    setBusy('approve')
    setError(null)
    try {
      await approvePostViaToken({ data: { token, postId: post.id, reviewerName: null } })
      onAction(post.id, 'approved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  const handleRequestChanges = async () => {
    if (!note.trim()) return
    setBusy('changes')
    setError(null)
    try {
      await requestChangesViaToken({ data: { token, postId: post.id, note, reviewerName: null } })
      onAction(post.id, 'changes_requested')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
            {post.content || '(no content)'}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-1">
              {post.platforms.map((p) =>
                PLATFORMS[p as PlatformKey] ? (
                  <span key={p} title={PLATFORMS[p as PlatformKey]?.label ?? p} className="inline-flex">
                    <PlatformIcon platform={p as PlatformKey} size={18} />
                  </span>
                ) : null,
              )}
            </div>
            {post.authorName && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                by {post.authorName}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {showNote ? (
        <div className="mt-4 space-y-2">
          <textarea
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            rows={3}
            placeholder={t('review.whatNeedsToChange')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRequestChanges}
              disabled={!note.trim() || busy !== null}
            >
              {busy === 'changes' ? <Spinner /> : null} {t('review.requestChanges')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowNote(false)
                setNote('')
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={handleApprove} disabled={busy !== null}>
            {busy === 'approve' ? <Spinner /> : <Check className="h-3.5 w-3.5" />}{' '}
            {t('review.approve')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowNote(true)} disabled={busy !== null}>
            <MessageSquare className="h-3.5 w-3.5" /> {t('review.requestChanges')}
          </Button>
        </div>
      )}
    </div>
  )
}
