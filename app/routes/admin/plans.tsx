import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { toast } from '~/components/ui/toast'
import { useConfirm } from '~/components/ui/confirm'
import { useT } from '~/lib/i18n'
import {
  listAdminPlans,
  upsertAdminPlan,
  deleteAdminPlan,
  type AdminPlanRow,
} from '~/server/admin'

const PROVIDERS = ['stripe', 'polar', 'dodo', 'autumn', 'creem', 'chargebee'] as const

export const Route = createFileRoute('/admin/plans')({
  loader: async () => ({ plans: await listAdminPlans() }),
  component: PlansPage,
})

function PlansPage() {
  const t = useT()
  const { plans } = Route.useLoaderData()
  const router = useRouter()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<AdminPlanRow | null>(null)
  const [creating, setCreating] = useState(false)

  const reload = async () => {
    await router.invalidate()
  }

  const onDelete = async (key: string) => {
    const ok = await confirm({
      title: t('adminPlans.deleteTitle', { key }),
      message: t('adminPlans.deleteMessage'),
      destructive: true,
      confirmLabel: t('adminPlans.deleteConfirm'),
    })
    if (!ok) return
    await deleteAdminPlan({ data: { key } })
    toast.success(t('adminPlans.deleted', { key }))
    await reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {t('adminPlans.title')}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('adminPlans.description')}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t('adminPlans.newPlan')}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            onEdit={() => setEditing(plan)}
            onDelete={() => onDelete(plan.key)}
          />
        ))}
      </div>

      {editing ? (
        <PlanEditor
          plan={editing}
          existingKeys={plans.map((p) => p.key)}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await reload()
          }}
        />
      ) : null}
      {creating ? (
        <PlanEditor
          plan={null}
          existingKeys={plans.map((p) => p.key)}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false)
            await reload()
          }}
        />
      ) : null}
    </div>
  )
}

function PlanCard({
  plan,
  onEdit,
  onDelete,
}: {
  plan: AdminPlanRow
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useT()
  const providerCount = Object.values(plan.providerIds).reduce(
    (n, arr) => n + arr.length,
    0,
  )
  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {plan.label}
            </div>
            <code className="text-xs text-neutral-500 dark:text-neutral-400">{plan.key}</code>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={onEdit}>
              {t('adminPlans.edit')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <DLRow label={t('adminPlans.statMembers')} value={plan.maxMembers} />
          <DLRow label={t('adminPlans.statAccounts')} value={plan.maxConnectedAccounts} />
          <DLRow label={t('adminPlans.statPosts')} value={plan.maxScheduledPostsPerMonth} />
          <DLRow
            label={t('adminPlans.statAiAssist')}
            value={plan.aiAssistEnabled ? t('adminPlans.yes') : t('adminPlans.no')}
          />
        </dl>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {providerCount === 0
            ? t('adminPlans.noProviders')
            : t(
                providerCount === 1
                  ? 'adminPlans.providerCount'
                  : 'adminPlans.providerCountPlural',
                { count: providerCount },
              )}
        </div>
      </div>
    </Card>
  )
}

function DLRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="font-medium text-neutral-900 dark:text-neutral-100">{value}</dd>
    </div>
  )
}

function PlanEditor({
  plan,
  existingKeys,
  onClose,
  onSaved,
}: {
  plan: AdminPlanRow | null
  existingKeys: string[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const [key, setKey] = useState(plan?.key ?? '')
  const [label, setLabel] = useState(plan?.label ?? '')
  const [maxMembers, setMaxMembers] = useState(plan?.maxMembers ?? 1)
  const [maxConnectedAccounts, setMaxConnectedAccounts] = useState(
    plan?.maxConnectedAccounts ?? 1,
  )
  const [maxScheduledPostsPerMonth, setMaxScheduledPostsPerMonth] = useState(
    plan?.maxScheduledPostsPerMonth ?? 10,
  )
  const [aiAssistEnabled, setAiAssistEnabled] = useState(plan?.aiAssistEnabled ?? false)
  const [sortOrder, setSortOrder] = useState(plan?.sortOrder ?? 99)
  const [priceDisplay, setPriceDisplay] = useState(plan?.priceDisplay ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [providerIds, setProviderIds] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const p of PROVIDERS) {
      out[p] = (plan?.providerIds[p] ?? []).join(', ')
    }
    return out
  })
  const [saving, setSaving] = useState(false)

  const isNew = plan === null
  const keyConflict = isNew && existingKeys.includes(key)

  const save = async () => {
    if (!key.trim() || !label.trim()) {
      toast.error(t('adminPlans.keyLabelRequired'))
      return
    }
    if (keyConflict) {
      toast.error(t('adminPlans.keyConflict', { key }))
      return
    }
    setSaving(true)
    try {
      const parsed: Record<string, string[]> = {}
      for (const p of PROVIDERS) {
        const ids = providerIds[p]!
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (ids.length > 0) parsed[p] = ids
      }
      await upsertAdminPlan({
        data: {
          key: key.trim(),
          label: label.trim(),
          maxMembers,
          maxConnectedAccounts,
          maxScheduledPostsPerMonth,
          aiAssistEnabled,
          providerIds: parsed,
          sortOrder,
          priceDisplay: priceDisplay.trim() === '' ? null : priceDisplay.trim(),
          description: description.trim() === '' ? null : description.trim(),
        },
      })
      toast.success(t('adminPlans.saved', { key }))
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('adminPlans.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {isNew ? t('adminPlans.newPlan') : t('adminPlans.editPlan', { label: plan.label })}
            </h3>
            <Button size="sm" variant="ghost" onClick={onClose}>
              {t('adminPlans.cancel')}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label={t('adminPlans.fieldKey')}
              htmlFor="plan-key"
              hint={t('adminPlans.fieldKeyHint')}
            >
              <Input
                id="plan-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={!isNew}
                placeholder="pro"
              />
            </Field>
            <Field label={t('adminPlans.fieldLabel')} htmlFor="plan-label">
              <Input
                id="plan-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Pro"
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <NumberField
              label={t('adminPlans.fieldMaxMembers')}
              value={maxMembers}
              onChange={setMaxMembers}
              min={1}
              max={100000}
            />
            <NumberField
              label={t('adminPlans.fieldMaxAccounts')}
              value={maxConnectedAccounts}
              onChange={setMaxConnectedAccounts}
              min={1}
              max={100000}
            />
            <NumberField
              label={t('adminPlans.fieldMaxPosts')}
              value={maxScheduledPostsPerMonth}
              onChange={setMaxScheduledPostsPerMonth}
              min={0}
              max={10000000}
            />
            <NumberField
              label={t('adminPlans.fieldSortOrder')}
              value={sortOrder}
              onChange={setSortOrder}
              min={0}
              max={1000}
              hint={t('adminPlans.fieldSortOrderHint')}
            />
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={aiAssistEnabled}
              onChange={(e) => setAiAssistEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">{t('adminPlans.aiAssistToggle')}</span>
          </label>

          <div className="space-y-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3">
            <div className="text-sm font-semibold">{t('adminPlans.marketingSection')}</div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('adminPlans.marketingSectionHint')}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t('adminPlans.fieldPriceDisplay')} htmlFor="plan-price">
                <Input
                  id="plan-price"
                  value={priceDisplay}
                  onChange={(e) => setPriceDisplay(e.target.value)}
                  placeholder="$9/mo"
                  maxLength={60}
                />
              </Field>
              <Field label={t('adminPlans.fieldDescription')} htmlFor="plan-desc">
                <Input
                  id="plan-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('adminPlans.fieldDescriptionPlaceholder')}
                  maxLength={400}
                />
              </Field>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('adminPlans.mostPopularHint')}
            </p>
          </div>

          <div className="space-y-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3">
            <div className="text-sm font-semibold">{t('adminPlans.providerIds')}</div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('adminPlans.providerIdsHint')}
            </p>
            {PROVIDERS.map((p) => (
              <Field key={p} label={p[0]!.toUpperCase() + p.slice(1)} htmlFor={`pid-${p}`}>
                <Input
                  id={`pid-${p}`}
                  value={providerIds[p]}
                  onChange={(e) =>
                    setProviderIds((prev) => ({ ...prev, [p]: e.target.value }))
                  }
                  placeholder={examplePlaceholder(p)}
                />
              </Field>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('adminPlans.cancel')}
            </Button>
            <Button onClick={save} disabled={saving || keyConflict}>
              {saving ? <Spinner /> : null} {t('adminPlans.save')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  hint?: string
}) {
  return (
    <Field label={label} htmlFor={`n-${label}`} hint={hint}>
      <Input
        id={`n-${label}`}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      />
    </Field>
  )
}

function examplePlaceholder(p: string): string {
  switch (p) {
    case 'stripe':
      return 'price_1A2b3C, price_4D5e6F'
    case 'polar':
      return 'prod_abc'
    case 'dodo':
      return 'prod_xyz'
    default:
      return ''
  }
}
