import { useMemo, useReducer, useRef, useState } from 'react'
import {
  Plus,
  X,
  Sparkles,
  Smile,
  Hash,
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
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { cn } from '~/lib/utils'
import { composerReducer } from './state'
import { initialState, type ConnectedAccount, type Version } from './types'
import { MediaZone } from './MediaZone'
import { detectMismatches, MediaMismatchBanner } from './MediaMismatchBanner'
import { PostPreview } from './PostPreview'
import { saveDraft } from '~/server/composer'
import { addToQueue, publishNow, schedulePost } from '~/server/scheduling'

export function StandardComposer({
  workspaceSlug,
  accounts,
}: {
  workspaceSlug: string
  accounts: ConnectedAccount[]
}) {
  const [state, dispatch] = useReducer(composerReducer, undefined, initialState)
  const [saving, setSaving] = useState<null | 'draft' | 'schedule' | 'queue' | 'now'>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleAt, setScheduleAt] = useState<string>(defaultScheduleLocal())
  const navigate = useNavigate()

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
        mode: state.startMode,
        socialAccountIds: state.selectedAccountIds,
        versions: state.versions.map((v) => ({
          platforms: v.platforms,
          content: v.content,
          firstComment: v.firstCommentEnabled ? v.firstComment : null,
          isThread: v.isThread,
          threadParts: v.threadParts.map((p) => ({ content: p.content, mediaIds: p.mediaIds })),
          mediaIds: v.mediaIds,
          isDefault: v.isDefault,
        })),
        reddit: redditSelected ? state.reddit : null,
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

  const onDiscard = () => {
    const hasContent =
      state.versions.some((v) => v.content || v.firstComment || v.mediaIds.length > 0) ||
      state.selectedAccountIds.length > 0
    if (hasContent && !confirm('Discard this draft? Your changes will be lost.')) return
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
            />
            <MediaZone
              workspaceSlug={workspaceSlug}
              mediaIds={activeVersion.mediaIds}
              mediaById={state.mediaById}
              onUploaded={(assets) =>
                dispatch({ type: 'ADD_MEDIA', versionId: activeVersion.id, assets })
              }
              onRemove={(mediaId) =>
                dispatch({ type: 'REMOVE_MEDIA', versionId: activeVersion.id, mediaId })
              }
            />
            <MediaMismatchBanner items={mismatchesByVersion[activeVersion.id] ?? []} />
            {redditSelected && activeVersion.platforms.includes('reddit') ? (
              <RedditFields
                value={state.reddit}
                onChange={(patch) => dispatch({ type: 'UPDATE_REDDIT', patch })}
              />
            ) : null}
          </>
        ) : null}

        <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
          <Button type="button" variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
          <div className="relative flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onSaveDraft}
              disabled={saving !== null || state.selectedAccountIds.length === 0}
            >
              {saving === 'draft' ? <Spinner /> : null}
              Save Draft
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onAddToQueue}
              disabled={saving !== null || hasMismatch || state.selectedAccountIds.length === 0}
            >
              {saving === 'queue' ? <Spinner /> : null}
              Add to Queue
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onPublishNow}
              disabled={saving !== null || hasMismatch || state.selectedAccountIds.length === 0}
            >
              {saving === 'now' ? <Spinner /> : null}
              Publish Now
            </Button>
            <Button
              type="button"
              onClick={() => setScheduleOpen((o) => !o)}
              disabled={saving !== null || hasMismatch || state.selectedAccountIds.length === 0}
            >
              Schedule
            </Button>
            {scheduleOpen ? (
              <div className="absolute bottom-full right-0 z-20 mb-2 w-80 rounded-md border border-neutral-200 bg-white p-4 shadow-lg">
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-neutral-900">Schedule post</div>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="w-full rounded border border-neutral-200 px-2 py-1.5 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setScheduleOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={onConfirmSchedule}
                      disabled={saving !== null || !scheduleAt}
                    >
                      {saving === 'schedule' ? <Spinner /> : null}
                      Schedule Post
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
        {toast ? (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
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
        <h3 className="text-sm font-semibold text-neutral-700">Preview</h3>
        {activeVersion && activeVersion.platforms.length > 0 ? (
          <PreviewTabs
            version={activeVersion}
            accounts={accounts}
            selectedAccountIds={state.selectedAccountIds}
            mediaById={state.mediaById}
            reddit={state.reddit}
          />
        ) : (
          <Card>
            <div className="p-8 text-center text-sm text-neutral-500">
              Select accounts to see a live preview.
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function defaultScheduleLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
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
  return (
    <Card>
      <div className="space-y-2 p-4">
        <div className="text-sm font-medium text-neutral-700">Start from</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <RadioCard
            selected={mode === 'shared'}
            label="Shared content"
            description="One base, platform overrides via versions"
            onSelect={() => onChange('shared')}
          />
          <RadioCard
            selected={mode === 'independent'}
            label="Independent per platform"
            description="Each platform is a blank slate"
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
        selected ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-200 hover:bg-neutral-50',
      )}
    >
      <div
        className={cn(
          'mt-0.5 h-4 w-4 rounded-full border',
          selected ? 'border-indigo-500 bg-indigo-500' : 'border-neutral-300',
        )}
      />
      <div>
        <div className="text-sm font-medium text-neutral-900">{label}</div>
        <div className="text-xs text-neutral-500">{description}</div>
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
          No accounts connected yet.{' '}
          <a
            className="text-indigo-600 hover:underline"
            href={`/${workspaceSlug}/accounts`}
          >
            Connect one →
          </a>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-neutral-700">Post to</div>
          {minLimit !== null ? (
            <div className="text-xs text-neutral-500">
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
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50',
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
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200">
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
                  : 'text-neutral-600 hover:text-neutral-900',
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
                className="mr-1 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                aria-label="Remove version"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        )
      })}
      {mode === 'shared' && unassignedPlatforms.length > 0 ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddOpen((o) => !o)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
          >
            <Plus className="h-3 w-3" /> Add Version
            <ChevronDown className="h-3 w-3" />
          </button>
          {addOpen ? (
            <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-neutral-200 bg-white p-1 shadow-lg">
              {unassignedPlatforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onAdd([p])
                    setAddOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-100"
                >
                  <PlatformIcon platform={p} size={16} />
                  {PLATFORMS[p].label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Editor({
  version,
  supportsFirstComment,
  supportsThread,
  dispatch,
}: {
  version: Version
  supportsFirstComment: boolean
  supportsThread: boolean
  dispatch: React.Dispatch<import('./state').Action>
}) {
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
            placeholder="What do you want to say?"
            className="min-h-[160px] w-full resize-y rounded-md border border-neutral-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <div className="space-y-2">
            {version.threadParts.map((part, idx) => (
              <div key={part.id} className="space-y-1 rounded-md border border-neutral-200 p-2">
                <div className="flex items-center justify-between text-xs text-neutral-500">
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
                  className="min-h-[80px] w-full resize-y rounded border border-neutral-200 p-2 text-sm"
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
              <Plus className="h-3 w-3" /> Add part
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <ToolbarBtn title="Emoji" onClick={() => alert('Emoji picker — coming later')}>
            <Smile className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Hashtag groups" onClick={() => alert('Hashtag groups land in Stage 12')}>
            <Hash className="h-4 w-4" />
          </ToolbarBtn>
          <div className="relative">
            <ToolbarBtn title="Variables" onClick={() => setShowVariables((o) => !o)}>
              <Code className="h-4 w-4" />
            </ToolbarBtn>
            {showVariables ? (
              <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-md border border-neutral-200 bg-white p-1 shadow-lg">
                {['{date}', '{time}', '{day}', '{month}', '{year}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      insertAtCursor(v)
                      setShowVariables(false)
                    }}
                    className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-100"
                  >
                    {v}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <ToolbarBtn title="AI Assist" onClick={() => alert('AI Assist lands in Stage 8')}>
            <Sparkles className="h-4 w-4" />
          </ToolbarBtn>
          <div className="ml-auto flex items-center gap-3 text-xs">
            {supportsThread ? (
              <label className="flex items-center gap-1 text-neutral-600">
                <input
                  type="checkbox"
                  checked={version.isThread}
                  onChange={(e) =>
                    dispatch({ type: 'TOGGLE_THREAD', versionId: version.id, value: e.target.checked })
                  }
                />
                Thread
              </label>
            ) : null}
            {!version.isThread ? (
              <span
                className={cn(
                  'tabular-nums',
                  currentLen > minLimit ? 'text-red-600 font-semibold' : 'text-neutral-500',
                )}
              >
                {currentLen} / {minLimit.toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>

        {supportsFirstComment ? (
          <div className="rounded-md border border-neutral-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
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
              Add first comment
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
                placeholder="First comment posted after your main post"
                className="mt-2 min-h-[60px] w-full resize-y rounded border border-neutral-200 p-2 text-sm"
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
      className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100"
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
      className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
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
  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="text-sm font-semibold text-neutral-700">Reddit options</div>
        <Field label="Title" htmlFor="reddit-title">
          <Input
            id="reddit-title"
            maxLength={300}
            value={value.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Post title (required, max 300 chars)"
          />
        </Field>
        <Field label="Subreddit" htmlFor="reddit-sub">
          <Input
            id="reddit-sub"
            value={value.subreddit}
            onChange={(e) => onChange({ subreddit: e.target.value })}
            placeholder="r/yourSub"
          />
        </Field>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1">
            Post type
            <select
              value={value.postType}
              onChange={(e) =>
                onChange({ postType: e.target.value as import('./types').RedditFields['postType'] })
              }
              className="rounded border border-neutral-200 px-2 py-1"
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
                : 'bg-white text-neutral-600 hover:bg-neutral-100',
            )}
          >
            <PlatformIcon platform={p} size={14} />
            {PLATFORMS[p].label}
          </button>
        ))}
      </div>
      {textLen > textLimit ? (
        <div className="text-xs text-red-600">
          Over limit by {textLen - textLimit} characters.
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
