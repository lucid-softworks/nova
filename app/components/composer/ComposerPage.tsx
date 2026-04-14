import { useState } from 'react'
import { cn } from '~/lib/utils'
import { StandardComposer } from './StandardComposer'
import { CampaignComposer } from './CampaignComposer'
import type { ConnectedAccount } from './types'
import type { WorkspaceRole } from '~/server/types'

export function ComposerPage({
  workspaceSlug,
  accounts,
  userRole,
  requireApproval,
}: {
  workspaceSlug: string
  accounts: ConnectedAccount[]
  userRole: WorkspaceRole
  requireApproval: boolean
}) {
  const [mode, setMode] = useState<'standard' | 'campaign'>('standard')
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border border-neutral-200 bg-white p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode('standard')}
          className={cn(
            'rounded px-3 py-1',
            mode === 'standard' ? 'bg-indigo-500 text-white' : 'text-neutral-600',
          )}
        >
          Standard Post
        </button>
        <button
          type="button"
          onClick={() => setMode('campaign')}
          className={cn(
            'rounded px-3 py-1',
            mode === 'campaign' ? 'bg-indigo-500 text-white' : 'text-neutral-600',
          )}
        >
          Campaign
        </button>
      </div>
      {mode === 'standard' ? (
        <StandardComposer
          workspaceSlug={workspaceSlug}
          accounts={accounts}
          userRole={userRole}
          requireApproval={requireApproval}
        />
      ) : (
        <CampaignComposer workspaceSlug={workspaceSlug} accounts={accounts} />
      )}
    </div>
  )
}
