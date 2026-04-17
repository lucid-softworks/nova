import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  Plus,
  X,
  Sparkles,
  Code,
  ArrowUp,
  ArrowDown,
  Trash2,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Card } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { cn } from '~/lib/utils'
import { composerReducer } from './state'
import { hydrateStateFromPost, initialState, type ConnectedAccount, type Version } from './types'
import type { LoadedPost } from '~/server/composer'
import { MediaZone } from './MediaZone'
import { detectMismatches, MediaMismatchBanner } from './MediaMismatchBanner'
import { PostPreview } from './PostPreview'
import { PlatformPreview } from './PlatformPreview'
import { AIAssistPanel } from './AIAssistPanel'
import { EmojiPicker } from './EmojiPicker'
import { HashtagPickerButton } from './HashtagPickerButton'
import { HashtagSuggestButton } from './HashtagSuggestButton'
import { SavedReplyPicker } from './SavedReplyPicker'
import { saveDraft } from '~/server/composer'
import { addToQueue, publishNow, schedulePost, submitForApproval } from '~/server/scheduling'
import type { WorkspaceRole } from '~/server/types'
import { useT } from '~/lib/i18n'

export function StandardComposer({
  workspaceSlug,
  accounts,
  userRole,
  requireApproval,
  existing,
  initialScheduledAt,
  reply,
}: {
  workspaceSlug: string
  accounts: ConnectedAccount[]
  userRole: WorkspaceRole
  requireApproval: boolean
  existing: LoadedPost | null
  initialScheduledAt: string | null
  reply: { replyTo: string; handle: string; accountId: string | null } | null
}) {
  const t = useT()
  const needsApproval = requireApproval && userRole === 'editor'
  const [state, dispatch] = useReducer(
    composerReducer,
    undefined,
    () => {
      if (existing) return hydrateStateFromPost(existing)
      const base = initialState()
      if (reply) {
        base.replyToPostId = reply.replyTo
        const defaultVersion = base.versions.find((v) => v.isDefault)
        if (defaultVersion && reply.handle) defaultVersion.content = `@${reply.handle} `
        if (reply.accountId && accounts.some((a) => a.id === reply.accountId)) {
          base.selectedAccountIds = [reply.accountId]
        }
      }
      return base
    },
  )
  const [saving, setSaving] = useState<null | 'draft' | 'schedule' | 'queue' | 'now' | 'approval'>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleAt, setScheduleAt] = useState<string>(() => {
    const preset = initialScheduledAt ?? existing?.scheduledAt ?? null
    return preset ? toLocalInputValue(preset) : defaultScheduleLocal()
  })
  const [aiOpen, setAiOpen] = useState(false)
  const navigate = useNavigate()

  // Read a pending template from sessionStorage (written by the Templates page
  // "Use Template" button) and pre-fill the default version + auto-select any
  // single-account-per-platform matches.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (existing) return
    let payload: { content?: string; platforms?: string[] } | null = null
    try {
      const raw = sessionStorage.getItem('nova:template:next')
      if (!raw) return
      payload = JSON.parse(raw)
      sessionStorage.removeItem('nova:template:next')
    } catch {
      return
    }
    if (!payload) return
    const defaultVersion = state.versions.find((v) => v.isDefault)
    if (defaultVersion && payload.content) {
      dispatch({ type: 'UPDATE_CONTENT', versionId: defaultVersion.id, content: payload.content })
    }
    if (payload.platforms) {
      for (const p of payload.platforms) {
        const match = accounts.filter((a) => a.platform === p)
        if (match.length === 1 && !state.selectedAccountIds.includes(match[0]!.id)) {
          dispatch({ type: 'TOGGLE_ACCOUNT', accountId: match[0]!.id, accounts })
        }
      }
    }
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedPlatforms = useMemo<PlatformKey[]>(() => {
    const set = new Set<PlatformKey>()
    for (const id of state.selectedAccountIds) {
      const acct = accounts.find((a) => a.id === id)
      if (acct) set.add(acct.platform)
    }
    return [...set]
  }, [state.selectedAccountIds, accounts])

  const activeVersion =
    state.versions.find((v) => v.id === state.activeVersionId) ?? state.versions[0]

  const redditSelected = selectedPlatforms.includes('reddit')
  const mismatchesByVersion = useMemo(() => {
    const out: Record<string, ReturnType<typeof detectMismatches>> = {}
    for (const v of state.versions) {
      const media = v.mediaIds
        .map((id) => state.mediaById[id])
        .filter((m): m is NonNullable<typeof m> => m !== undefined)
      out[v.id] = detectMismatches(v.platforms, media)
    }
    return out
  }, [state.versions, state.mediaById])

  const hasMismatch = Object.values(mismatchesByVersion).some((arr) => arr.length > 0)

  const supportsFirstComment = activeVersion?.platforms.some(
    (p) => PLATFORMS[p].supportsFirstComment,
  )
  const supportsThread = activeVersion?.platforms.some((p) => PLATFORMS[p].supportsThreads)

  const unassignedPlatforms = useMemo(() => {
    const claimed = new Set<PlatformKey>()
    for (const v of state.versions) {
      if (!v.isDefault) v.platforms.forEach((p) => claimed.add(p))
    }
    return selectedPlatforms.filter((p) => !claimed.has(p))
  }, [state.versions, selectedPlatforms])

  const persist = async () => {
    const { postId } = await saveDraft({
      data: {
        workspaceSlug,
        postId: existing?.id,
        mode: state.startMode,
        socialAccountIds: state.selectedAccountIds,
        versions: state.versions.map((v) => ({
          platforms: v.platforms,
          content: v.content,
          firstComment: v.firstCommentEnabled ? v.firstComment : null,
          isThread: v.isThread,
          threadParts: v.threadParts.map((p) => ({ content: p.content, mediaIds: p.mediaIds })),
          mediaIds: v.mediaIds,
          altTextByMediaId: v.altTextByMediaId,
          blueskyLabels: v.blueskyLabels as ('suggestive' | 'nudity' | 'porn' | 'graphic-media')[],
          isDefault: v.isDefault,
        })),
        reddit: redditSelected ? state.reddit : null,
        replyToPostId: state.replyToPostId,
      },
    })
    return postId
  }

  const onSaveDraft = async () => {
    setSaveError(null)
    setSaving('draft')
    try {
      await persist()
      navigate({ to: '/$workspaceSlug/posts', params: { workspaceSlug } })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save draft')
    } finally {
      setSaving(null)
    }
  }

  const onConfirmSchedule = async () => {
    setSaveError(null)
    setSaving('schedule')
    try {
      const postId = await persist()
      const iso = new Date(scheduleAt).toISOString()
      await schedulePost({ data: { workspaceSlug, postId, scheduledAt: iso } })
      navigate({ to: '/$workspaceSlug/posts', params: { workspaceSlug } })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not schedule')
    } finally {
      setSaving(null)
      setScheduleOpen(false)
    }
  }

  const onAddToQueue = async () => {
    setSaveError(null)
    setToast(null)
    setSaving('queue')
    try {
      const postId = await persist()
      const result = await addToQueue({ data: { workspaceSlug, postId } })
      if (!result.ok) {
        setToast(
          'No posting schedule yet — add one in Settings → Posting Schedule, then try again.',
        )
        return
      }
      navigate({ to: '/$workspaceSlug/posts', params: { workspaceSlug } })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not queue')
    } finally {
      setSaving(null)
    }
  }

  const onPublishNow = async () => {
    setSaveError(null)
    setSaving('now')
    try {
      const postId = await persist()
      await publishNow({ data: { workspaceSlug, postId } })
      navigate({ to: '/$workspaceSlug/posts', params: { workspaceSlug } })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not publish')
    } finally {
      setSaving(null)
    }
  }

  const onSubmitForApproval = async () => {
    setSaveError(null)
    setSaving('approval')
    try {
      const postId = await persist()
      await submitForApproval({ data: { workspaceSlug, postId } })
      navigate({ to: '/$workspaceSlug/posts', params: { workspaceSlug } })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not submit')
    } finally {
      setSaving(null)
    }
  }

  const onDiscard = () => {
    const hasContent =
      state.versions.some((v) => v.content || v.firstComment || v.mediaIds.length > 0) ||
      state.selectedAccountIds.length > 0
    if (hasContent && !confirm(t('compose.discardConfirm'))) return
    dispatch({ type: 'RESET', state: initialState() })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <StartFromSelector
          mode={state.startMode}
          onChange={(mode) => dispatch({ type: 'SET_START_MODE', mode, accounts })}
        />
        <AccountPicker
          accounts={accounts}
          selected={state.selectedAccountIds}
          onToggle={(id) => dispatch({ type: 'TOGGLE_ACCOUNT', accountId: id, accounts })}
          workspaceSlug={workspaceSlug}
        />
        {selectedPlatforms.length > 0 && activeVersion ? (
          <>
            <VersionTabs
              versions={state.versions}
              activeId={activeVersion.id}
              mode={state.startMode}
              unassignedPlatforms={unassignedPlatforms}
              onSelect={(id) => dispatch({ type: 'SET_ACTIVE', versionId: id })}
              onAdd={(platforms) => dispatch({ type: 'ADD_VERSION', platforms })}
              onRemove={(id) => dispatch({ type: 'REMOVE_VERSION', versionId: id })}
              mismatchesByVersion={mismatchesByVersion}
            />
            <Editor
              version={activeVersion}
              supportsFirstComment={!!supportsFirstComment}
              supportsThread={!!supportsThread}
              dispatch={dispatch}
              onOpenAI={() => setAiOpen(true)}
              workspaceSlug={workspaceSlug}
              isReply={!!state.replyToPostId}
            />
            <MediaZone
              workspaceSlug={workspaceSlug}
              mediaIds={activeVersion.mediaIds}
              mediaById={state.mediaById}
              altTextByMediaId={activeVersion.altTextByMediaId}
              onUploaded={(assets) =>
                dispatch({ type: 'ADD_MEDIA', versionId: activeVersion.id, assets })
              }
              onRemove={(mediaId) =>
                dispatch({ type: 'REMOVE_MEDIA', versionId: activeVersion.id, mediaId })
              }
              onAltTextChange={(mediaId, value) =>
                dispatch({ type: 'SET_ALT_TEXT', versionId: activeVersion.id, mediaId, value })
              }
            />
            <MediaMismatchBanner items={mismatchesByVersion[activeVersion.id] ?? []} />
            {redditSelected && activeVersion.platforms.includes('reddit') ? (
              <RedditFields
                value={state.reddit}
                onChange={(patch) => dispatch({ type: 'UPDATE_REDDIT', patch })}
              />
            ) : null}
            {activeVersion.platforms.includes('bluesky') ? (
              <BlueskyLabels
                values={activeVersion.blueskyLabels}
                onToggle={(label) =>
                  dispatch({ type: 'TOGGLE_BLUESKY_LABEL', versionId: activeVersion.id, label })
                }
              />
            ) : null}
          </>
        ) : null}

        <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800 pt-4">
          <Button type="button" variant="ghost" onClick={onDiscard}>
            {t('compose.discard')}
          </Button>
          <div className="relative flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onSaveDraft}
              disabled={saving !== null || state.selectedAccountIds.length === 0}
            >
              {saving === 'draft' ? <Spinner /> : null}
              {t('compose.saveDraft')}
            </Button>
            {needsApproval ? (
              <Button
                type="button"
                onClick={onSubmitForApproval}
                disabled={saving !== null || hasMismatch || state.selectedAccountIds.length === 0}
              >
                {saving === 'approval' ? <Spinner /> : null}
                {t('compose.submitForApproval')}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onAddToQueue}
                  disabled={saving !== null || hasMismatch || state.selectedAccountIds.length === 0}
                >
                  {saving === 'queue' ? <Spinner /> : null}
                  {t('compose.addToQueue')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onPublishNow}
                  disabled={saving !== null || hasMismatch || state.selectedAccountIds.length === 0}
                >
                  {saving === 'now' ? <Spinner /> : null}
                  {t('compose.publishNow')}
                </Button>
                <Button
                  type="button"
                  onClick={() => setScheduleOpen((o) => !o)}
                  disabled={saving !== null || hasMismatch || state.selectedAccountIds.length === 0}
                >
                  {t('compose.schedule')}
                </Button>
              </>
            )}
            {scheduleOpen ? (
              <div className="absolute bottom-full right-0 z-20 mb-2 w-80 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-lg">
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('compose.schedulePost')}</div>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="w-full rounded border border-neutral-200 dark:border-neutral-800 px-2 py-1.5 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setScheduleOpen(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={onConfirmSchedule}
                      disabled={saving !== null || !scheduleAt}
                    >
                      {saving === 'schedule' ? <Spinner /> : null}
                      {t('compose.schedulePostBtn')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
        {toast ? (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/40 p-3 text-sm text-yellow-800">
            {toast}{' '}
            <a
              className="underline"
              href={`/${workspaceSlug}/settings/schedule`}
            >
              Open schedule
            </a>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{t('compose.preview')}</h3>
        {activeVersion && activeVersion.platforms.length > 0 ? (
          <>
            <PreviewTabs
              version={activeVersion}
              accounts={accounts}
              selectedAccountIds={state.selectedAccountIds}
              mediaById={state.mediaById}
              reddit={state.reddit}
            />
            <PlatformPreviewSection
              version={activeVersion}
              accounts={accounts}
              selectedAccountIds={state.selectedAccountIds}
              mediaById={state.mediaById}
            />
          </>
        ) : (
          <Card>
            <div className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {t('compose.selectAccountsForPreview')}
            </div>
          </Card>
        )}
      </div>

      <AIAssistPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        workspaceSlug={workspaceSlug}
        platforms={activeVersion?.platforms ?? selectedPlatforms}
        existingContent={activeVersion?.content ?? ''}
        onUseText={(text) => {
          if (activeVersion) {
            dispatch({ type: 'UPDATE_CONTENT', versionId: activeVersion.id, content: text })
          }
        }}
      />
    </div>
  )
}

function defaultScheduleLocal(): string {
  return toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000).toISOString())
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return defaultScheduleLocal()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// -- sub-components --------------------------------------------------------

function StartFromSelector({
  mode,
  onChange,
}: {
  mode: 'shared' | 'independent'
  onChange: (m: 'shared' | 'independent') => void
}) {
  const t = useT()
  return (
    <Card>
      <div className="space-y-2 p-4">
        <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('compose.startFrom')}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <RadioCard
            selected={mode === 'shared'}
            label={t('compose.sharedContent')}
            description={t('compose.sharedContentDesc')}
            onSelect={() => onChange('shared')}
          />
          <RadioCard
            selected={mode === 'independent'}
            label={t('compose.independentPerPlatform')}
            description={t('compose.independentPerPlatformDesc')}
            onSelect={() => onChange('independent')}
          />
        </div>
      </div>
    </Card>
  )
}

function RadioCard({
  selected,
  label,
  description,
  onSelect,
}: {
  selected: boolean
  label: string
  description: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-start gap-2 rounded-md border p-3 text-left',
        selected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800',
      )}
    >
      <div
        className={cn(
          'mt-0.5 h-4 w-4 rounded-full border',
          selected ? 'border-indigo-500 bg-indigo-500' : 'border-neutral-300',
        )}
      />
      <div>
        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">{description}</div>
      </div>
    </button>
  )
}

function AccountPicker({
  accounts,
  selected,
  onToggle,
  workspaceSlug,
}: {
  accounts: ConnectedAccount[]
  selected: string[]
  onToggle: (id: string) => void
  workspaceSlug: string
}) {
  const t = useT()
  const selectedPlatforms = [
    ...new Set(
      selected.map((id) => accounts.find((a) => a.id === id)?.platform).filter(Boolean) as PlatformKey[],
    ),
  ]
  const minLimit = selectedPlatforms.length
    ? Math.min(...selectedPlatforms.map((p) => PLATFORMS[p].textLimit))
    : null

  if (accounts.length === 0) {
    return (
      <Card>
        <div className="p-4 text-sm">
          {t('compose.noAccountsConnected')}{' '}
          <a
            className="text-indigo-600 hover:underline"
            href={`/${workspaceSlug}/accounts`}
          >
            {t('compose.connectOne')}
          </a>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('compose.postTo')}</div>
          {minLimit !== null ? (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Limit: {minLimit.toLocaleString()} chars
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const p = PLATFORMS[a.platform]
            const isSelected = selected.includes(a.id)
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onToggle(a.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-2 py-1 text-xs',
                  isSelected
                    ? 'border-transparent text-white'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800',
                )}
                style={isSelected ? { backgroundColor: p.color } : undefined}
                title={`${p.label} · @${a.accountHandle}`}
              >
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                ) : (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold"
                    style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : p.color, color: 'white' }}
                  >
                    {p.label.charAt(0)}
                  </div>
                )}
                <span>@{a.accountHandle}</span>
              </button>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

function VersionTabs({
  versions,
  activeId,
  mode,
  unassignedPlatforms,
  onSelect,
  onAdd,
  onRemove,
  mismatchesByVersion,
}: {
  versions: Version[]
  activeId: string
  mode: 'shared' | 'independent'
  unassignedPlatforms: PlatformKey[]
  onSelect: (id: string) => void
  onAdd: (platforms: PlatformKey[]) => void
  onRemove: (id: string) => void
  mismatchesByVersion: Record<string, { platform: PlatformKey; message: string }[]>
}) {
  const t = useT()

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 dark:border-neutral-800">
      {versions.map((v) => {
        const hasIssue = (mismatchesByVersion[v.id] ?? []).length > 0
        const label = v.isDefault ? 'Default' : v.platforms.length === 1 ? PLATFORMS[v.platforms[0]!].label : v.label
        return (
          <div key={v.id} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(v.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium',
                v.id === activeId
                  ? 'border-b-2 border-indigo-500 text-indigo-600'
                  : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50',
              )}
            >
              {hasIssue ? (
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
              ) : (
                <div className="flex -space-x-1">
                  {(v.platforms.length ? v.platforms : ['x']).slice(0, 3).map((p) => (
                    <PlatformIcon key={p} platform={p as PlatformKey} size={14} />
                  ))}
                </div>
              )}
              <span>{label}</span>
            </button>
            {!v.isDefault ? (
              <button
                type="button"
                onClick={() => onRemove(v.id)}
                className="mr-1 rounded p-1 text-neutral-400 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-600"
                aria-label="Remove version"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        )
      })}
      {mode === 'shared' && unassignedPlatforms.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            >
              <Plus className="h-3 w-3" /> {t('compose.addVersion')}
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {unassignedPlatforms.map((p) => (
              <DropdownMenuItem key={p} onSelect={() => onAdd([p])}>
                <PlatformIcon platform={p} size={16} />
                {PLATFORMS[p].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

function Editor({
  version,
  supportsFirstComment,
  supportsThread,
  dispatch,
  onOpenAI,
  workspaceSlug,
  isReply,
}: {
  version: Version
  supportsFirstComment: boolean
  supportsThread: boolean
  dispatch: React.Dispatch<import('./state').Action>
  onOpenAI: () => void
  workspaceSlug: string
  isReply?: boolean
}) {
  const t = useT()
  const minLimit = version.platforms.length
    ? Math.min(...version.platforms.map((p) => PLATFORMS[p].textLimit))
    : 280
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showVariables, setShowVariables] = useState(false)

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = version.content.slice(0, start) + text + version.content.slice(end)
    dispatch({ type: 'UPDATE_CONTENT', versionId: version.id, content: next })
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    })
  }

  const currentLen = version.isThread
    ? 0
    : version.content.length

  return (
    <Card>
      <div className="space-y-3 p-4">
        {!version.isThread ? (
          <textarea
            ref={textareaRef}
            value={version.content}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_CONTENT', versionId: version.id, content: e.target.value })
            }
            placeholder={t('compose.whatDoYouWantToSay')}
            className="min-h-[160px] w-full resize-y rounded-md border border-neutral-200 dark:border-neutral-800 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <div className="space-y-2">
            {version.threadParts.map((part, idx) => (
              <div key={part.id} className="space-y-1 rounded-md border border-neutral-200 dark:border-neutral-800 p-2">
                <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span>Part {idx + 1}</span>
                  <div className="flex gap-1">
                    <IconBtn
                      onClick={() =>
                        dispatch({ type: 'THREAD_MOVE', versionId: version.id, partId: part.id, direction: 'up' })
                      }
                      disabled={idx === 0}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </IconBtn>
                    <IconBtn
                      onClick={() =>
                        dispatch({ type: 'THREAD_MOVE', versionId: version.id, partId: part.id, direction: 'down' })
                      }
                      disabled={idx === version.threadParts.length - 1}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </IconBtn>
                    <IconBtn
                      onClick={() =>
                        dispatch({ type: 'THREAD_REMOVE', versionId: version.id, partId: part.id })
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </IconBtn>
                  </div>
                </div>
                <textarea
                  value={part.content}
                  onChange={(e) =>
                    dispatch({
                      type: 'THREAD_UPDATE',
                      versionId: version.id,
                      partId: part.id,
                      value: e.target.value,
                    })
                  }
                  className="min-h-[80px] w-full resize-y rounded border border-neutral-200 dark:border-neutral-800 p-2 text-sm"
                  placeholder={`Part ${idx + 1}`}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'THREAD_ADD', versionId: version.id })}
            >
              <Plus className="h-3 w-3" /> {t('compose.addPart')}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <EmojiPicker onPick={(e) => insertAtCursor(e)} />
          <HashtagPickerButton
            workspaceSlug={workspaceSlug}
            onInsert={(text) => insertAtCursor(` ${text}`)}
          />
          <HashtagSuggestButton
            content={version.content}
            platforms={version.platforms}
            workspaceSlug={workspaceSlug}
            onInsert={(text) => insertAtCursor(text)}
          />
          {isReply ? (
            <SavedReplyPicker
              workspaceSlug={workspaceSlug}
              onPick={(text) => insertAtCursor(text)}
            />
          ) : null}
          <div className="relative">
            <ToolbarBtn title={t('compose.variables')} onClick={() => setShowVariables((o) => !o)}>
              <Code className="h-4 w-4" />
            </ToolbarBtn>
            {showVariables ? (
              <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1 shadow-lg">
                {['{date}', '{time}', '{day}', '{month}', '{year}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      insertAtCursor(v)
                      setShowVariables(false)
                    }}
                    className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    {v}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <ToolbarBtn title={t('compose.aiAssist')} onClick={onOpenAI}>
            <Sparkles className="h-4 w-4" />
          </ToolbarBtn>
          <div className="ml-auto flex items-center gap-3 text-xs">
            {supportsThread ? (
              <label className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={version.isThread}
                  onChange={(e) =>
                    dispatch({ type: 'TOGGLE_THREAD', versionId: version.id, value: e.target.checked })
                  }
                />
                {t('compose.thread')}
              </label>
            ) : null}
            {!version.isThread ? (
              <span
                className={cn(
                  'tabular-nums',
                  currentLen > minLimit ? 'text-red-600 font-semibold' : 'text-neutral-500 dark:text-neutral-400',
                )}
              >
                {currentLen} / {minLimit.toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>

        {supportsFirstComment ? (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
              <input
                type="checkbox"
                checked={version.firstCommentEnabled}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_FIRST_COMMENT_ENABLED',
                    versionId: version.id,
                    value: e.target.checked,
                  })
                }
              />
              {t('compose.addFirstComment')}
            </label>
            {version.firstCommentEnabled ? (
              <textarea
                value={version.firstComment}
                onChange={(e) =>
                  dispatch({
                    type: 'UPDATE_FIRST_COMMENT',
                    versionId: version.id,
                    value: e.target.value,
                  })
                }
                placeholder={t('compose.firstCommentPlaceholder')}
                className="mt-2 min-h-[60px] w-full resize-y rounded border border-neutral-200 dark:border-neutral-800 p-2 text-sm"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

function ToolbarBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  )
}

function IconBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function RedditFields({
  value,
  onChange,
}: {
  value: import('./types').RedditFields
  onChange: (patch: Partial<import('./types').RedditFields>) => void
}) {
  const t = useT()
  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{t('compose.redditOptions')}</div>
        <Field label={t('compose.redditTitle')} htmlFor="reddit-title">
          <Input
            id="reddit-title"
            maxLength={300}
            value={value.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={t('compose.redditTitlePlaceholder')}
          />
        </Field>
        <Field label={t('compose.redditSubreddit')} htmlFor="reddit-sub">
          <Input
            id="reddit-sub"
            value={value.subreddit}
            onChange={(e) => onChange({ subreddit: e.target.value })}
            placeholder="r/yourSub"
          />
        </Field>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1">
            {t('compose.postType')}
            <select
              value={value.postType}
              onChange={(e) =>
                onChange({ postType: e.target.value as import('./types').RedditFields['postType'] })
              }
              className="rounded border border-neutral-200 dark:border-neutral-800 px-2 py-1"
            >
              <option value="text">Text</option>
              <option value="link">Link</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={value.nsfw}
              onChange={(e) => onChange({ nsfw: e.target.checked })}
            />
            NSFW
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={value.spoiler}
              onChange={(e) => onChange({ spoiler: e.target.checked })}
            />
            Spoiler
          </label>
        </div>
      </div>
    </Card>
  )
}

function PlatformPreviewSection({
  version,
  accounts,
  selectedAccountIds,
  mediaById,
}: {
  version: Version
  accounts: ConnectedAccount[]
  selectedAccountIds: string[]
  mediaById: Record<string, import('./types').MediaAsset>
}) {
  const [open, setOpen] = useState(false)
  const t = useT()

  const platforms = version.platforms.length ? version.platforms : []
  if (platforms.length === 0) return null

  const account = accounts.find(
    (a) => platforms.includes(a.platform) && selectedAccountIds.includes(a.id),
  )
  const firstMedia = version.mediaIds.length > 0 ? mediaById[version.mediaIds[0]!] : undefined
  const firstImageUrl = firstMedia && firstMedia.mimeType.startsWith('image/') ? firstMedia.url : null

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 pt-3">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50 dark:hover:text-neutral-100"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        {t('compose.previewDescription')}
      </button>
      {open && (
        <div className="mt-2">
          <PlatformPreview
            content={version.content}
            platforms={platforms}
            accountHandle={account?.accountHandle ?? 'you'}
            accountName={account?.accountName ?? 'Your Account'}
            firstImageUrl={firstImageUrl}
          />
        </div>
      )}
    </div>
  )
}

function PreviewTabs({
  version,
  accounts,
  selectedAccountIds,
  mediaById,
  reddit,
}: {
  version: Version
  accounts: ConnectedAccount[]
  selectedAccountIds: string[]
  mediaById: Record<string, import('./types').MediaAsset>
  reddit: import('./types').RedditFields
}) {
  const t = useT()
  const [activePlatform, setActivePlatform] = useState<PlatformKey>(version.platforms[0] ?? 'x')
  const platforms = version.platforms.length ? version.platforms : ['x' as PlatformKey]
  const current = platforms.includes(activePlatform) ? activePlatform : platforms[0]!
  const account = accounts.find(
    (a) => a.platform === current && selectedAccountIds.includes(a.id),
  ) ?? null

  const textLimit = PLATFORMS[current].textLimit
  const textLen = version.isThread
    ? version.threadParts.reduce((n, p) => Math.max(n, p.content.length), 0)
    : version.content.length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {platforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setActivePlatform(p)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs',
              current === p
                ? 'bg-neutral-900 text-white'
                : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            )}
          >
            <PlatformIcon platform={p} size={14} />
            {PLATFORMS[p].label}
          </button>
        ))}
      </div>
      {textLen > textLimit ? (
        <div className="text-xs text-red-600">
          {t('compose.overLimitBy', { count: textLen - textLimit })}
        </div>
      ) : null}
      <PostPreview
        version={version}
        account={account}
        platform={current}
        mediaById={mediaById}
        redditTitle={reddit.title}
        subreddit={reddit.subreddit}
      />
    </div>
  )
}

const BLUESKY_LABEL_CHOICES: { value: string; label: string; description: string }[] = [
  { value: 'suggestive', label: 'Suggestive', description: 'Mildly suggestive content.' },
  { value: 'nudity', label: 'Nudity', description: 'Non-sexual nudity (art, medical, etc).' },
  { value: 'porn', label: 'Adult', description: 'Explicit sexual content.' },
  { value: 'graphic-media', label: 'Graphic media', description: 'Violence, gore, or other disturbing imagery.' },
]

function BlueskyLabels({
  values,
  onToggle,
}: {
  values: string[]
  onToggle: (label: string) => void
}) {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3">
      <div className="mb-2">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Bluesky content warnings
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Self-labels attached to the post so viewers can filter or hide it.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {BLUESKY_LABEL_CHOICES.map((choice) => {
          const checked = values.includes(choice.value)
          return (
            <label
              key={choice.value}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-2 hover:border-indigo-300 dark:hover:border-indigo-700"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(choice.value)}
                className="mt-0.5 h-4 w-4"
              />
              <div className="flex-1">
                <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                  {choice.label}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {choice.description}
                </div>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
