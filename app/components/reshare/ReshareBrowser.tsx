import { useMemo, useState } from 'react'
import { X, Search, Check, AlertCircle, Sparkles } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { AIAssistPanel } from '~/components/composer/AIAssistPanel'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'
import {
  RESHARE_PLATFORMS,
  browseAccount,
  searchPosts,
  queueReshares,
  type BrowseResult,
  type ReshareSource,
} from '~/server/reshare'

type ResharePlatform = (typeof RESHARE_PLATFORMS)[number]

type Mode = 'browse' | 'search'

type SelectedItem = ReshareSource & {
  reshareType: 'repost' | 'quote' | 'reblog' | 'boost' | 'crosspost' | 'share'
  quoteComment: string
  targetSubreddit: string
}

export type ReshareAccount = {
  id: string
  platform: PlatformKey
  accountHandle: string
  accountName: string
}

const DEFAULT_RESHARE_TYPE: Record<ResharePlatform, SelectedItem['reshareType']> = {
  x: 'repost',
  tumblr: 'reblog',
  facebook: 'share',
  linkedin: 'repost',
  threads: 'repost',
  bluesky: 'repost',
  mastodon: 'boost',
  reddit: 'crosspost',
}

export function ReshareBrowser({
  open,
  onClose,
  workspaceSlug,
  accounts,
}: {
  open: boolean
  onClose: () => void
  workspaceSlug: string
  accounts: ReshareAccount[]
}) {
  const t = useT()
  const [platform, setPlatform] = useState<ResharePlatform>('bluesky')
  const [mode, setMode] = useState<Mode>('browse')
  const [handle, setHandle] = useState('')
  const [query, setQuery] = useState('')
  const [subreddit, setSubreddit] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BrowseResult | null>(null)
  const [selectedBySource, setSelectedBySource] = useState<Record<string, SelectedItem>>({})
  const [scheduleMode, setScheduleMode] = useState<'queue' | 'schedule'>('queue')
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [targetAccountId, setTargetAccountId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const accountsForPlatform = useMemo(
    () => accounts.filter((a) => a.platform === platform),
    [accounts, platform],
  )

  if (!open) return null

  const reset = () => {
    setResult(null)
    setSelectedBySource({})
    setToast(null)
  }

  const onPlatformChange = (p: ResharePlatform) => {
    setPlatform(p)
    reset()
    setTargetAccountId('')
  }

  const runBrowse = async () => {
    if (!handle.trim()) return
    setLoading(true)
    setToast(null)
    try {
      const r = await browseAccount({
        data: { workspaceSlug, platform, handle: handle.trim() },
      })
      setResult(r)
      setSelectedBySource({})
    } catch (e) {
      setResult({ kind: 'unsupported', message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  const runSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setToast(null)
    try {
      const r = await searchPosts({
        data: {
          workspaceSlug,
          platform,
          query: query.trim(),
          subreddit: platform === 'reddit' ? subreddit.trim() : null,
        },
      })
      setResult(r)
      setSelectedBySource({})
    } catch (e) {
      setResult({ kind: 'unsupported', message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  const toggleSelected = (src: ReshareSource) => {
    setSelectedBySource((prev) => {
      const next = { ...prev }
      if (next[src.sourcePostId]) {
        delete next[src.sourcePostId]
      } else {
        next[src.sourcePostId] = {
          ...src,
          reshareType: DEFAULT_RESHARE_TYPE[platform],
          quoteComment: '',
          targetSubreddit: '',
        }
      }
      return next
    })
  }

  const updateSelected = (sourcePostId: string, patch: Partial<SelectedItem>) => {
    setSelectedBySource((prev) => {
      const cur = prev[sourcePostId]
      if (!cur) return prev
      return { ...prev, [sourcePostId]: { ...cur, ...patch } }
    })
  }

  const submit = async () => {
    const items = Object.values(selectedBySource)
    if (items.length === 0) return
    if (!targetAccountId) {
      setToast(t('reshare.pickTargetAccount'))
      return
    }
    setSubmitting(true)
    setToast(null)
    try {
      const r = await queueReshares({
        data: {
          workspaceSlug,
          targetSocialAccountId: targetAccountId,
          platform,
          scheduledAt: scheduleMode === 'schedule' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          items: items.map((it) => ({
            sourcePostId: it.sourcePostId,
            sourcePostUrl: it.sourcePostUrl,
            sourceAuthorHandle: it.sourceAuthorHandle,
            sourceAuthorName: it.sourceAuthorName,
            sourceContent: it.sourceContent,
            sourceMediaUrls: it.sourceMediaUrls,
            reshareType: it.reshareType,
            quoteComment: it.reshareType === 'quote' || it.reshareType === 'reblog' ? it.quoteComment || null : null,
            targetSubreddit: it.reshareType === 'crosspost' ? it.targetSubreddit || null : null,
            platformExtra: it.platformExtra,
          })),
        },
      })
      if (r.kind === 'no_schedule') {
        setToast(t('reshare.noSchedule'))
        return
      }
      setToast(`${r.count} reshare${r.count === 1 ? '' : 's'} added to queue.`)
      setSelectedBySource({})
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Failed to queue')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCount = Object.keys(selectedBySource).length

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-[min(880px,100%)] flex-col bg-white dark:bg-neutral-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 p-4">
          <div className="text-lg font-semibold">{t('reshare.queueReshares')}</div>
          <button type="button" onClick={onClose} className="rounded p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 border-b border-neutral-200 dark:border-neutral-800 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={platform}
              onChange={(e) => onPlatformChange(e.target.value as ResharePlatform)}
              className="h-9 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 text-sm"
            >
              {RESHARE_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORMS[p].label}
                </option>
              ))}
            </select>
            <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('browse')}
                className={cn('rounded px-2 py-1', mode === 'browse' ? 'bg-neutral-900 text-white' : 'text-neutral-600 dark:text-neutral-300')}
              >
                {t('reshare.browseAccount')}
              </button>
              <button
                type="button"
                onClick={() => setMode('search')}
                className={cn('rounded px-2 py-1', mode === 'search' ? 'bg-neutral-900 text-white' : 'text-neutral-600 dark:text-neutral-300')}
              >
                {t('common.search')}
              </button>
            </div>
          </div>

          {mode === 'browse' ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void runBrowse()
              }}
            >
              <Input
                placeholder="@handle or did:plc:..."
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="max-w-sm"
              />
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner /> : null} {t('reshare.load')}
              </Button>
            </form>
          ) : (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void runSearch()
              }}
            >
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Keyword or #hashtag"
                  className="pl-8"
                />
              </div>
              {platform === 'reddit' ? (
                <Input
                  value={subreddit}
                  onChange={(e) => setSubreddit(e.target.value)}
                  placeholder="subreddit (r/...)"
                  className="max-w-xs"
                />
              ) : null}
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner /> : null} {t('common.search')}
              </Button>
            </form>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {result === null ? (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {t('reshare.chooseAndLoad')}
            </div>
          ) : result.kind === 'unsupported' ? (
            <div className="flex items-start gap-3 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/40 p-4 text-sm text-yellow-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">{t('reshare.limitedApiAccess')}</div>
                <div>{result.message}</div>
              </div>
            </div>
          ) : result.items.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {t('reshare.noResults')}
            </div>
          ) : (
            <div className="space-y-3">
              {result.items.map((src) => (
                <ResultCard
                  key={src.sourcePostId}
                  src={src}
                  platform={platform}
                  workspaceSlug={workspaceSlug}
                  selected={selectedBySource[src.sourcePostId] ?? null}
                  onToggle={() => toggleSelected(src)}
                  onUpdate={(patch) => updateSelected(src.sourcePostId, patch)}
                />
              ))}
            </div>
          )}
        </div>

        {selectedCount > 0 ? (
          <div className="space-y-2 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div>{t('reshare.reshareFrom')}</div>
              <select
                value={targetAccountId}
                onChange={(e) => setTargetAccountId(e.target.value)}
                className="h-8 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2"
              >
                <option value="">{t('reshare.selectAccount')}</option>
                {accountsForPlatform.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.accountHandle}
                  </option>
                ))}
              </select>
              <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setScheduleMode('queue')}
                  className={cn('rounded px-2 py-1', scheduleMode === 'queue' ? 'bg-neutral-900 text-white' : 'text-neutral-600 dark:text-neutral-300')}
                >
                  {t('reshare.addToQueue')}
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('schedule')}
                  className={cn('rounded px-2 py-1', scheduleMode === 'schedule' ? 'bg-neutral-900 text-white' : 'text-neutral-600 dark:text-neutral-300')}
                >
                  {t('compose.schedule')}
                </button>
              </div>
              {scheduleMode === 'schedule' ? (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="h-8 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 text-xs"
                />
              ) : null}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-neutral-600 dark:text-neutral-300">{t('reshare.selected', { count: String(selectedCount) })}</div>
              <Button
                type="button"
                onClick={submit}
                disabled={submitting || !targetAccountId || (scheduleMode === 'schedule' && !scheduledAt)}
              >
                {submitting ? <Spinner /> : null} {t('reshare.queuePosts', { count: String(selectedCount) })}
              </Button>
            </div>
            {toast ? <div className="text-xs text-neutral-700 dark:text-neutral-200">{toast}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------

function ResultCard({
  src,
  platform,
  workspaceSlug,
  selected,
  onToggle,
  onUpdate,
}: {
  src: ReshareSource
  platform: ResharePlatform
  workspaceSlug: string
  selected: SelectedItem | null
  onToggle: () => void
  onUpdate: (patch: Partial<SelectedItem>) => void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const longText = src.sourceContent.length > 280
  const textLimit = PLATFORMS[platform].textLimit
  const options = reshareOptions(platform)
  const showQuote = selected && (selected.reshareType === 'quote' || selected.reshareType === 'reblog')
  const showSub = selected && selected.reshareType === 'crosspost'

  return (
    <div
      className={cn(
        'relative rounded-md border p-3',
        selected ? 'border-indigo-400 bg-indigo-50/30' : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={selected ? 'Deselect' : 'Select'}
        className={cn(
          'absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded border',
          selected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-neutral-300 bg-white dark:bg-neutral-900',
        )}
      >
        {selected ? <Check className="h-3 w-3" /> : null}
      </button>

      <div className="flex gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-neutral-200">
          {src.platformExtra.avatar ? (
            <img src={src.platformExtra.avatar} alt="" className="h-9 w-9 rounded-full" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <PlatformIcon platform={platform} size={22} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 pr-6">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">{src.sourceAuthorName}</span>
            <span className="text-neutral-500 dark:text-neutral-400">@{src.sourceAuthorHandle}</span>
          </div>
          <div
            className={cn('mt-1 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100', !expanded && longText && 'line-clamp-3')}
          >
            {src.sourceContent}
          </div>
          {longText ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-0.5 text-xs text-indigo-600 hover:underline"
            >
              {expanded ? t('reshare.showLess') : t('reshare.showMore')}
            </button>
          ) : null}
          {src.sourceMediaUrls[0] ? (
            <img
              src={src.sourceMediaUrls[0]}
              alt=""
              className="mt-2 max-h-60 rounded border border-neutral-200 dark:border-neutral-800 object-cover"
            />
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            {src.postedAt ? <span>{new Date(src.postedAt).toLocaleDateString()}</span> : null}
            {src.stats.likes != null ? <span>❤ {src.stats.likes}</span> : null}
            {src.stats.reposts != null ? <span>↻ {src.stats.reposts}</span> : null}
            {src.stats.replies != null ? <span>💬 {src.stats.replies}</span> : null}
            <a
              href={src.sourcePostUrl}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline"
            >
              {t('reshare.open')} →
            </a>
          </div>
        </div>
      </div>

      {selected ? (
        <div className="mt-3 space-y-2 border-t border-neutral-200 dark:border-neutral-800 pt-2">
          <div className="flex flex-wrap gap-3 text-xs">
            {options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={selected.reshareType === opt.value}
                  onChange={() => onUpdate({ reshareType: opt.value })}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {showQuote ? (
            <div className="space-y-1">
              <textarea
                value={selected.quoteComment}
                onChange={(e) => onUpdate({ quoteComment: e.target.value })}
                placeholder={t('reshare.addCommentary')}
                className="min-h-[60px] w-full resize-y rounded border border-neutral-200 dark:border-neutral-800 p-2 text-sm"
              />
              <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                <span>
                  {selected.quoteComment.length} / {textLimit.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => setAiOpen(true)}
                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                >
                  <Sparkles className="h-3 w-3" /> {t('reshare.aiAssist')}
                </button>
              </div>
              <AIAssistPanel
                open={aiOpen}
                onClose={() => setAiOpen(false)}
                workspaceSlug={workspaceSlug}
                platforms={[platform]}
                existingContent={selected.quoteComment || src.sourceContent}
                onUseText={(text) => onUpdate({ quoteComment: text })}
              />
            </div>
          ) : null}
          {showSub ? (
            <Input
              value={selected.targetSubreddit}
              onChange={(e) => onUpdate({ targetSubreddit: e.target.value })}
              placeholder={t('reshare.targetSubreddit')}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function reshareOptions(
  platform: ResharePlatform,
): { value: SelectedItem['reshareType']; label: string }[] {
  switch (platform) {
    case 'x':
      return [
        { value: 'repost', label: 'Retweet' },
        { value: 'quote', label: 'Quote Tweet' },
      ]
    case 'tumblr':
      return [
        { value: 'reblog', label: 'Reblog' },
        { value: 'quote', label: 'Reblog with comment' },
      ]
    case 'facebook':
      return [{ value: 'share', label: 'Share' }]
    case 'linkedin':
      return [
        { value: 'repost', label: 'Repost' },
        { value: 'quote', label: 'Repost with comment' },
      ]
    case 'threads':
      return [{ value: 'repost', label: 'Repost' }]
    case 'bluesky':
      return [
        { value: 'repost', label: 'Repost' },
        { value: 'quote', label: 'Quote Post' },
      ]
    case 'mastodon':
      return [
        { value: 'boost', label: 'Boost' },
        { value: 'quote', label: 'Quote' },
      ]
    case 'reddit':
      return [{ value: 'crosspost', label: 'Crosspost' }]
  }
}
