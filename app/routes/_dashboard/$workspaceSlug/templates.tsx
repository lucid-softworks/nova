import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { PlatformIcon } from '~/components/accounts/PlatformIcon'
import { TemplateModal } from '~/components/templates/TemplateModal'
import { HashtagGroupModal } from '~/components/templates/HashtagGroupModal'
import {
  listTemplates,
  listHashtagGroups,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createHashtagGroup,
  updateHashtagGroup,
  deleteHashtagGroup,
  type HashtagGroupRow,
  type TemplateRow,
} from '~/server/templates'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/templates')({
  loader: async ({ params }) => {
    const [templates, groups] = await Promise.all([
      listTemplates({ data: { workspaceSlug: params.workspaceSlug } }),
      listHashtagGroups({ data: { workspaceSlug: params.workspaceSlug } }),
    ])
    return { templates, groups }
  },
  component: TemplatesPage,
})

function TemplatesPage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const [tab, setTab] = useState<'templates' | 'hashtags'>('templates')
  const [templates, setTemplates] = useState<TemplateRow[]>(initial.templates)
  const [groups, setGroups] = useState<HashtagGroupRow[]>(initial.groups)
  const navigate = useNavigate()

  const reloadTemplates = async () =>
    setTemplates(await listTemplates({ data: { workspaceSlug } }))
  const reloadGroups = async () =>
    setGroups(await listHashtagGroups({ data: { workspaceSlug } }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{t('templates.title')}</h2>
      </div>
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        <TabBtn active={tab === 'templates'} onClick={() => setTab('templates')}>
          {t('templates.templates')}
        </TabBtn>
        <TabBtn active={tab === 'hashtags'} onClick={() => setTab('hashtags')}>
          {t('templates.hashtagGroups')}
        </TabBtn>
      </div>

      {tab === 'templates' ? (
        <TemplatesTab
          templates={templates}
          workspaceSlug={workspaceSlug}
          onReload={reloadTemplates}
          onUse={(t) => {
            try {
              sessionStorage.setItem(
                'nova:template:next',
                JSON.stringify({ content: t.content, platforms: t.platforms }),
              )
            } catch {
              /* ignore */
            }
            navigate({ to: '/$workspaceSlug/compose', params: { workspaceSlug } })
          }}
        />
      ) : (
        <HashtagsTab groups={groups} workspaceSlug={workspaceSlug} onReload={reloadGroups} />
      )}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-2 text-sm font-medium',
        active ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900',
      )}
    >
      {children}
    </button>
  )
}

function TemplatesTab({
  templates,
  workspaceSlug,
  onReload,
  onUse,
}: {
  templates: TemplateRow[]
  workspaceSlug: string
  onReload: () => Promise<void>
  onUse: (t: TemplateRow) => void
}) {
  const t = useT()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TemplateRow | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
        >
          <Plus className="h-4 w-4" /> {t('templates.createTemplate')}
        </Button>
      </div>
      {templates.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {t('templates.noTemplates')}
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => {
                setEditing(t)
                setModalOpen(true)
              }}
              onUse={() => onUse(t)}
              onDelete={async () => {
                if (!confirm(`Delete "${t.name}"?`)) return
                await deleteTemplate({ data: { workspaceSlug, templateId: t.id } })
                await onReload()
              }}
            />
          ))}
        </div>
      )}
      <TemplateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing}
        onSubmit={async (input) => {
          if (editing) {
            await updateTemplate({
              data: { workspaceSlug, templateId: editing.id, ...input },
            })
          } else {
            await createTemplate({ data: { workspaceSlug, ...input } })
          }
          await onReload()
        }}
      />
    </div>
  )
}

function TemplateCard({
  template,
  onEdit,
  onUse,
  onDelete,
}: {
  template: TemplateRow
  onEdit: () => void
  onUse: () => void
  onDelete: () => Promise<void>
}) {
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <Card>
      <div className="relative space-y-2 p-4">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="absolute right-2 top-2 rounded p-1 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Menu"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-2 top-8 z-10 w-40 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1 text-sm shadow-lg">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => {
                setMenuOpen(false)
                onEdit()
              }}
            >
              <Pencil className="h-3 w-3" /> {t('common.edit')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-red-600 hover:bg-red-50"
              onClick={async () => {
                setMenuOpen(false)
                await onDelete()
              }}
            >
              <Trash2 className="h-3 w-3" /> {t('common.delete')}
            </button>
          </div>
        ) : null}
        <div className="pr-8 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{template.name}</div>
        <div className="line-clamp-3 whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-300">
          {template.content || <span className="italic text-neutral-400 dark:text-neutral-500">{t('templates.noContent')}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {template.platforms.slice(0, 6).map((p) => (
            <PlatformIcon key={p} platform={p} size={14} />
          ))}
          {template.platforms.length === 0 ? (
            <span className="text-xs text-neutral-400 dark:text-neutral-500">{t('templates.noPlatforms')}</span>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onUse} className="w-full">
          {t('templates.useTemplate')}
        </Button>
      </div>
    </Card>
  )
}

function HashtagsTab({
  groups,
  workspaceSlug,
  onReload,
}: {
  groups: HashtagGroupRow[]
  workspaceSlug: string
  onReload: () => Promise<void>
}) {
  const t = useT()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<HashtagGroupRow | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
        >
          <Plus className="h-4 w-4" /> {t('templates.createGroup')}
        </Button>
      </div>
      {groups.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {t('templates.noHashtagGroups')}
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              onEdit={() => {
                setEditing(g)
                setModalOpen(true)
              }}
              onDelete={async () => {
                if (!confirm(`Delete "${g.name}"?`)) return
                await deleteHashtagGroup({ data: { workspaceSlug, groupId: g.id } })
                await onReload()
              }}
            />
          ))}
        </div>
      )}
      <HashtagGroupModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing}
        onSubmit={async (input) => {
          if (editing) {
            await updateHashtagGroup({
              data: { workspaceSlug, groupId: editing.id, ...input },
            })
          } else {
            await createHashtagGroup({ data: { workspaceSlug, ...input } })
          }
          await onReload()
        }}
      />
    </div>
  )
}

function GroupRow({
  group,
  onEdit,
  onDelete,
}: {
  group: HashtagGroupRow
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const visible = expanded ? group.hashtags : group.hashtags.slice(0, 5)
  const hidden = Math.max(0, group.hashtags.length - visible.length)

  return (
    <Card>
      <div className="relative space-y-2 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="rounded p-0.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{group.name}</div>
          <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-600 dark:text-neutral-300">
            {group.hashtags.length}
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="ml-auto rounded p-1 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Menu"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div className="absolute right-2 top-8 z-10 w-36 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1 text-sm shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => {
                  setMenuOpen(false)
                  onEdit()
                }}
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-red-600 hover:bg-red-50"
                onClick={async () => {
                  setMenuOpen(false)
                  await onDelete()
                }}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1 pl-6">
          {visible.map((t) => (
            <span
              key={t}
              className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300"
            >
              {t}
            </span>
          ))}
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
            >
              +{hidden} more
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
