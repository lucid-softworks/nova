import { useState } from 'react'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'
import { StandardComposer } from './StandardComposer'
import { CampaignComposer } from './CampaignComposer'
import type { ConnectedAccount } from './types'
import type { WorkspaceRole } from '~/server/types'
import type { LoadedPost } from '~/server/composer'

export function ComposerPage({
  workspaceSlug,
  accounts,
  userRole,
  requireApproval,
  existing,
  initialScheduledAt,
  reply,
  quote,
}: {
  workspaceSlug: string
  accounts: ConnectedAccount[]
  userRole: WorkspaceRole
  requireApproval: boolean
  existing?: LoadedPost | null
  initialScheduledAt?: string | null
  reply?: { replyTo: string; handle: string; accountId: string | null } | null
  quote?: { quoteTo: string; handle: string; accountId: string | null } | null
}) {
  const t = useT()
  const [mode, setMode] = useState<'standard' | 'campaign'>('standard')
  const readOnly = existing?.status === 'published'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {readOnly ? null : (
          <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setMode('standard')}
              className={cn(
                'rounded px-3 py-1',
                mode === 'standard' ? 'bg-indigo-500 text-white' : 'text-neutral-600 dark:text-neutral-300',
              )}
            >
              {t('compose.standardPostLabel')}
            </button>
            <button
              type="button"
              onClick={() => setMode('campaign')}
              className={cn(
                'rounded px-3 py-1',
                mode === 'campaign' ? 'bg-indigo-500 text-white' : 'text-neutral-600 dark:text-neutral-300',
              )}
            >
              {t('compose.campaignLabel')}
            </button>
          </div>
        )}
        {existing && !readOnly ? (
          <div className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
            {t('compose.editingPost', { status: existing.status })}
          </div>
        ) : null}
      </div>
      {mode === 'standard' || readOnly ? (
        <StandardComposer
          workspaceSlug={workspaceSlug}
          accounts={accounts}
          userRole={userRole}
          requireApproval={requireApproval}
          existing={existing ?? null}
          initialScheduledAt={initialScheduledAt ?? null}
          reply={reply ?? null}
          quote={quote ?? null}
          readOnly={readOnly}
        />
      ) : (
        <CampaignComposer workspaceSlug={workspaceSlug} accounts={accounts} />
      )}
    </div>
  )
}
