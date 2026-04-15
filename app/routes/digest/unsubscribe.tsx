import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/digest/unsubscribe')({
  validateSearch: (s: Record<string, unknown>) => ({
    uid: typeof s.uid === 'string' ? s.uid : '',
    token: typeof s.token === 'string' ? s.token : '',
  }),
  loaderDeps: ({ search }) => ({ uid: search.uid, token: search.token }),
  loader: async ({ deps }) => {
    const { processUnsubscribe } = await import('~/server/digests/unsubscribe.server')
    return processUnsubscribe(deps.uid, deps.token)
  },
  component: UnsubscribePage,
})

function UnsubscribePage() {
  const state = Route.useLoaderData() as { ok: boolean; reason?: string }
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-[#0b0d12] p-4">
      <div className="max-w-md rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-center">
        {state.ok ? (
          <>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Unsubscribed
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              You won't receive weekly SocialHub digests anymore. You can re-enable them in
              Settings → Notifications.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Invalid link
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {state.reason ?? 'We couldn\u2019t verify this unsubscribe link.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
