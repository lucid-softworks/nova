import { useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Trash2, ChevronDown, ChevronRight, Code, Sparkles } from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { MediaZone } from './MediaZone'
import { AIAssistPanel } from './AIAssistPanel'
import { detectMismatches, MediaMismatchBanner } from './MediaMismatchBanner'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'
import { saveCampaign } from '~/server/campaigns'
import type { ConnectedAccount, MediaAsset } from './types'
import { makeId } from './types'

type TriggerType = 'immediate' | 'delay' | 'scheduled'

type CampaignStep = {
  clientId: string
  selectedAccountIds: string[]
  content: string
  mediaIds: string[]
  dependsOn: string | null
  triggerType: TriggerType | null
  triggerDelayMinutes: number | null
  triggerScheduledAt: string | null
  expanded: boolean
}

function newStep(): CampaignStep {
  return {
    clientId: makeId(),
    selectedAccountIds: [],
    content: '',
    mediaIds: [],
    dependsOn: null,
    triggerType: null,
    triggerDelayMinutes: 30,
    triggerScheduledAt: null,
    expanded: true,
  }
}

export function CampaignComposer({
  workspaceSlug,
  accounts,
}: {
  workspaceSlug: string
  accounts: ConnectedAccount[]
}) {
  const t = useT()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [steps, setSteps] = useState<CampaignStep[]>([newStep()])
  const [mediaById, setMediaById] = useState<Record<string, MediaAsset>>({})
  const [saving, setSaving] = useState<null | 'draft' | 'schedule'>(null)
  const [error, setError] = useState<string | null>(null)

  const update = (clientId: string, patch: Partial<CampaignStep>) =>
    setSteps((prev) => prev.map((s) => (s.clientId === clientId ? { ...s, ...patch } : s)))

  const addStep = () => {
    const prev = steps[steps.length - 1]
    const step: CampaignStep = {
      ...newStep(),
      dependsOn: prev?.clientId ?? null,
      triggerType: prev ? 'immediate' : null,
    }
    setSteps([...steps, step])
  }

  const removeStep = (clientId: string) => {
    setSteps((prev) =>
      prev
        .filter((s) => s.clientId !== clientId)
        .map((s) => (s.dependsOn === clientId ? { ...s, dependsOn: null, triggerType: null } : s)),
    )
  }

  const mismatches = useMemo(() => {
    const out: Record<string, ReturnType<typeof detectMismatches>> = {}
    for (const s of steps) {
      const platforms = platformsFor(s, accounts)
      const media = s.mediaIds
        .map((id) => mediaById[id])
        .filter((m): m is NonNullable<typeof m> => m !== undefined)
      out[s.clientId] = detectMismatches(platforms, media)
    }
    return out
  }, [steps, accounts, mediaById])
  const anyMismatch = Object.values(mismatches).some((arr) => arr.length > 0)

  const onSave = async (asDraft: boolean) => {
    setError(null)
    if (!name.trim()) {
      setError(t('compose.campaignNameRequired'))
      return
    }
    if (!asDraft) {
      for (const s of steps) {
        if (s.selectedAccountIds.length === 0) {
          setError(t('compose.everyStepNeedsAccount'))
          return
        }
        if (!s.dependsOn && !s.triggerScheduledAt) {
          setError(t('compose.rootStepsNeedSchedule'))
          return
        }
      }
      if (anyMismatch) {
        setError(t('compose.resolveMediaMismatches'))
        return
      }
    }
    setSaving(asDraft ? 'draft' : 'schedule')
    try {
      await saveCampaign({
        data: {
          workspaceSlug,
          name: name.trim(),
          asDraft,
          steps: steps.map((s) => ({
            clientId: s.clientId,
            selectedAccountIds: s.selectedAccountIds,
            content: s.content,
            mediaIds: s.mediaIds,
            dependsOnClientStepId: s.dependsOn,
            triggerType: s.dependsOn ? s.triggerType : null,
            triggerDelayMinutes: s.triggerType === 'delay' ? s.triggerDelayMinutes : null,
            triggerScheduledAt:
              s.dependsOn && s.triggerType === 'scheduled'
                ? s.triggerScheduledAt ? new Date(s.triggerScheduledAt).toISOString() : null
                : !s.dependsOn && s.triggerScheduledAt
                  ? new Date(s.triggerScheduledAt).toISOString()
                  : null,
          })),
        },
      })
      navigate({ to: '/$workspaceSlug/posts', params: { workspaceSlug } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save campaign')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4">
          <Field label={t('compose.campaignName')} htmlFor="campaign-name">
            <Input
              id="campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product Launch Week"
            />
          </Field>
        </div>
      </Card>

      <ol className="space-y-0">
        {steps.map((step, idx) => (
          <li key={step.clientId}>
            <StepCard
              step={step}
              index={idx}
              allSteps={steps}
              accounts={accounts}
              mediaById={mediaById}
              onChange={(patch) => update(step.clientId, patch)}
              onRemove={() => removeStep(step.clientId)}
              workspaceSlug={workspaceSlug}
              onMediaUploaded={(assets) => {
                setMediaById((prev) => {
                  const n = { ...prev }
                  for (const a of assets) n[a.id] = a
                  return n
                })
                update(step.clientId, { mediaIds: [...step.mediaIds, ...assets.map((a) => a.id)] })
              }}
              onMediaRemove={(mid) => update(step.clientId, { mediaIds: step.mediaIds.filter((x) => x !== mid) })}
              mismatches={mismatches[step.clientId] ?? []}
            />
            {idx < steps.length - 1 ? (
              <div className="ml-6 h-4 border-l-2 border-dashed border-neutral-300" />
            ) : null}
          </li>
        ))}
      </ol>

      <Button type="button" variant="outline" onClick={addStep}>
        <Plus className="h-4 w-4" /> {t('compose.addStep')}
      </Button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 dark:border-neutral-800 pt-4">
        <Button type="button" variant="ghost" onClick={() => onSave(true)} disabled={saving !== null}>
          {saving === 'draft' ? <Spinner /> : null}
          {t('compose.saveCampaignDraft')}
        </Button>
        <Button type="button" onClick={() => onSave(false)} disabled={saving !== null || anyMismatch}>
          {saving === 'schedule' ? <Spinner /> : null}
          {t('compose.scheduleCampaign')}
        </Button>
      </div>
    </div>
  )
}

function platformsFor(step: CampaignStep, accounts: ConnectedAccount[]): PlatformKey[] {
  const set = new Set<PlatformKey>()
  for (const id of step.selectedAccountIds) {
    const acct = accounts.find((a) => a.id === id)
    if (acct) set.add(acct.platform)
  }
  return [...set]
}

function StepCard({
  step,
  index,
  allSteps,
  accounts,
  mediaById,
  onChange,
  onRemove,
  workspaceSlug,
  onMediaUploaded,
  onMediaRemove,
  mismatches,
}: {
  step: CampaignStep
  index: number
  allSteps: CampaignStep[]
  accounts: ConnectedAccount[]
  mediaById: Record<string, MediaAsset>
  onChange: (patch: Partial<CampaignStep>) => void
  onRemove: () => void
  workspaceSlug: string
  onMediaUploaded: (a: MediaAsset[]) => void
  onMediaRemove: (id: string) => void
  mismatches: { platform: PlatformKey; message: string }[]
}) {
  const platforms = platformsFor(step, accounts)
  const dependsIdx = step.dependsOn ? allSteps.findIndex((s) => s.clientId === step.dependsOn) : -1
  const isRoot = !step.dependsOn
  const availableDeps = allSteps.slice(0, index).filter((s) => s.clientId !== step.clientId)

  const priorSteps = allSteps.slice(0, index)
  const urlVariables = useMemo(() => {
    if (!step.dependsOn) return []
    const vars: { key: string; label: string }[] = []
    for (let i = 0; i < priorSteps.length; i++) {
      const ps = priorSteps[i]!
      const prevPlatforms = platformsFor(ps, accounts)
      for (const p of prevPlatforms) {
        if (PLATFORMS[p].supportsUrlVariable && PLATFORMS[p].urlVariableName) {
          const key = `{step${i + 1}_${PLATFORMS[p].urlVariableName!.replace(/_url$/, '')}_url}`
          vars.push({ key, label: `${PLATFORMS[p].label} URL from Step ${i + 1}` })
        }
      }
    }
    return vars
  }, [priorSteps, accounts, step.dependsOn])

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 p-3">
        <button
          type="button"
          onClick={() => onChange({ expanded: !step.expanded })}
          className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100"
        >
          {step.expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Step {index + 1}
        </button>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove step">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {step.expanded ? (
        <div className="space-y-3 p-4">
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">Accounts</div>
            {accounts.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No connected accounts.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const p = PLATFORMS[a.platform]
                  const selected = step.selectedAccountIds.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() =>
                        onChange({
                          selectedAccountIds: selected
                            ? step.selectedAccountIds.filter((x) => x !== a.id)
                            : [...step.selectedAccountIds, a.id],
                        })
                      }
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs',
                        selected
                          ? 'border-transparent text-white'
                          : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200',
                      )}
                      style={selected ? { backgroundColor: p.color } : undefined}
                    >
                      {p.label} · @{a.accountHandle}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {isRoot ? (
            <Field label="Scheduled at" htmlFor={`root-${step.clientId}`}>
              <Input
                id={`root-${step.clientId}`}
                type="datetime-local"
                value={step.triggerScheduledAt ?? ''}
                onChange={(e) => onChange({ triggerScheduledAt: e.target.value || null })}
              />
            </Field>
          ) : (
            <div className="space-y-2 rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-600 dark:text-neutral-300">Depends on:</span>
                <select
                  value={step.dependsOn ?? ''}
                  onChange={(e) => onChange({ dependsOn: e.target.value || null })}
                  className="rounded border border-neutral-200 dark:border-neutral-800 px-2 py-1 text-sm"
                >
                  {availableDeps.map((s) => {
                    const i = allSteps.findIndex((x) => x.clientId === s.clientId)
                    return (
                      <option key={s.clientId} value={s.clientId}>
                        Step {i + 1}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={step.triggerType === 'immediate'}
                    onChange={() => onChange({ triggerType: 'immediate' })}
                  />
                  Immediately when Step {dependsIdx + 1} succeeds
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={step.triggerType === 'delay'}
                    onChange={() => onChange({ triggerType: 'delay' })}
                  />
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    value={step.triggerDelayMinutes ?? 30}
                    onChange={(e) => onChange({ triggerDelayMinutes: Number(e.target.value) || 0 })}
                    className="w-20 rounded border border-neutral-200 dark:border-neutral-800 px-2 py-1 text-sm"
                  />
                  minutes after Step {dependsIdx + 1} succeeds
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={step.triggerType === 'scheduled'}
                    onChange={() => onChange({ triggerType: 'scheduled' })}
                  />
                  At:
                  <input
                    type="datetime-local"
                    value={step.triggerScheduledAt ?? ''}
                    onChange={(e) =>
                      onChange({
                        triggerScheduledAt: e.target.value || null,
                        triggerType: 'scheduled',
                      })
                    }
                    className="rounded border border-neutral-200 dark:border-neutral-800 px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </div>
          )}

          <StepContent
            content={step.content}
            onChange={(v) => onChange({ content: v })}
            urlVariables={urlVariables}
            workspaceSlug={workspaceSlug}
            platforms={platforms}
          />

          <MediaZone
            workspaceSlug={workspaceSlug}
            mediaIds={step.mediaIds}
            mediaById={mediaById}
            onUploaded={onMediaUploaded}
            onRemove={onMediaRemove}
          />
          <MediaMismatchBanner items={mismatches} />
          {platforms.length > 0 ? (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Platforms: {platforms.map((p) => PLATFORMS[p].label).join(', ')}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

function StepContent({
  content,
  onChange,
  urlVariables,
  workspaceSlug,
  platforms,
}: {
  content: string
  onChange: (v: string) => void
  urlVariables: { key: string; label: string }[]
  workspaceSlug: string
  platforms: PlatformKey[]
}) {
  const [open, setOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current
    if (!el) {
      onChange(content + text)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    onChange(content.slice(0, start) + text + content.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Step content"
        className="min-h-[120px] w-full resize-y rounded-md border border-neutral-200 dark:border-neutral-800 p-3 text-sm"
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAiOpen(true)}>
          <Sparkles className="h-3 w-3" /> AI Assist
        </Button>
      </div>
      <AIAssistPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        workspaceSlug={workspaceSlug}
        platforms={platforms}
        existingContent={content}
        onUseText={(text) => onChange(text)}
      />
      {urlVariables.length > 0 ? (
        <div className="relative inline-block">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
            <Code className="h-3 w-3" /> Insert URL variable
          </Button>
          {open ? (
            <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1 shadow-lg">
              {urlVariables.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    insertAtCursor(v.key)
                    setOpen(false)
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <code className="text-xs">{v.key}</code>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{v.label}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
