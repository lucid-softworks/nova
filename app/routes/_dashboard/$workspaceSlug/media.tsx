import { createFileRoute } from '@tanstack/react-router'
import { toast } from '~/components/ui/toast'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Upload, Trash2, FolderInput, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'
import { FolderTree, type SelectedFolder } from '~/components/media/FolderTree'
import { MediaAssetCard } from '~/components/media/MediaAssetCard'
import { MediaPreviewModal } from '~/components/media/MediaPreviewModal'
import {
  listAssets,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveAssets,
  deleteAssets,
  type AssetSummary,
  type FolderNode,
} from '~/server/media'

type Filter = 'all' | 'image' | 'video' | 'gif'
type Sort = 'date_desc' | 'date_asc' | 'name' | 'size'
type Size = 'sm' | 'md' | 'lg'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/media')({
  loader: async ({ params }) => {
    const [folders, assets] = await Promise.all([
      listFolders({ data: { workspaceSlug: params.workspaceSlug } }),
      listAssets({
        data: {
          workspaceSlug: params.workspaceSlug,
          folderId: null,
          search: null,
          filter: 'all',
          sort: 'date_desc',
        },
      }),
    ])
    return { folders, assets }
  },
  component: MediaPage,
})

function MediaPage() {
  const t = useT()
  const { workspaceSlug } = Route.useParams()
  const initial = Route.useLoaderData()
  const [folders, setFolders] = useState<FolderNode[]>(initial.folders)
  const [assets, setAssets] = useState<AssetSummary[]>(initial.assets)
  const [selectedFolder, setSelectedFolder] = useState<SelectedFolder>('all')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('date_desc')
  const [size, setSize] = useState<Size>('md')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<AssetSummary | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const [moveOpen, setMoveOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reloadFolders = async () =>
    setFolders(await listFolders({ data: { workspaceSlug } }))

  const reloadAssets = async () => {
    setRefreshing(true)
    try {
      const folderIdForQuery: string | null =
        selectedFolder === 'all'
          ? null
          : selectedFolder === 'uncategorized'
            ? 'uncategorized'
            : selectedFolder
      const data = await listAssets({
        data: {
          workspaceSlug,
          folderId: folderIdForQuery,
          search: search || null,
          filter,
          sort,
        },
      })
      setAssets(data)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void reloadAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolder, search, filter, sort])

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    const names = files.map((f) => f.name)
    setUploading((prev) => [...prev, ...names])
    try {
      const targetFolder =
        typeof selectedFolder === 'string' && selectedFolder !== 'all' && selectedFolder !== 'uncategorized'
          ? selectedFolder
          : ''
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        const url = `/api/media/upload?workspaceSlug=${encodeURIComponent(workspaceSlug)}${
          targetFolder ? `&folderId=${encodeURIComponent(targetFolder)}` : ''
        }`
        const res = await fetch(url, { method: 'POST', body: form })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error ?? `Upload failed (${res.status})`)
        }
      }
      await reloadAssets()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading((prev) => prev.filter((n) => !names.includes(n)))
    }
  }

  // Page-wide drag-drop
  useEffect(() => {
    const onOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        setDragActive(true)
      }
    }
    const onLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragActive(false)
    }
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        e.preventDefault()
        setDragActive(false)
        void uploadFiles(Array.from(e.dataTransfer.files))
      }
    }
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolder, workspaceSlug])

  const toggleSelect = (id: string, _additive: boolean) => {
    void _additive
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAll = () => setSelectedIds(new Set(assets.map((a) => a.id)))
  const clearSelection = () => setSelectedIds(new Set())

  const onMove = async (folderId: string | null) => {
    await moveAssets({ data: { workspaceSlug, assetIds: [...selectedIds], folderId } })
    setMoveOpen(false)
    clearSelection()
    await reloadAssets()
  }

  const onDeleteSelected = async () => {
    if (!confirm(t('media.deleteAssets', { count: selectedIds.size }))) return
    await deleteAssets({ data: { workspaceSlug, assetIds: [...selectedIds] } })
    clearSelection()
    await reloadAssets()
  }

  const onDeleteSingle = async (id: string) => {
    await deleteAssets({ data: { workspaceSlug, assetIds: [id] } })
    setPreview(null)
    await reloadAssets()
  }

  const gridCols = useMemo(() => {
    return size === 'sm' ? 'grid-cols-6' : size === 'md' ? 'grid-cols-4' : 'grid-cols-3'
  }, [size])

  return (
    <div className="relative flex gap-4">
      <FolderTree
        folders={folders}
        selected={selectedFolder}
        onSelect={(v) => {
          setSelectedFolder(v)
          clearSelection()
        }}
        onCreate={async (name, parentId) => {
          await createFolder({ data: { workspaceSlug, name, parentId } })
          await reloadFolders()
        }}
        onRename={async (id, name) => {
          await renameFolder({ data: { workspaceSlug, folderId: id, name } })
          await reloadFolders()
        }}
        onDelete={async (id) => {
          await deleteFolder({ data: { workspaceSlug, folderId: id } })
          if (selectedFolder === id) setSelectedFolder('all')
          await reloadFolders()
          await reloadAssets()
        }}
      />

      <div className="flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('media.searchFilenames')}
              className="pl-8"
            />
          </div>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('media.all')}
          </FilterChip>
          <FilterChip active={filter === 'image'} onClick={() => setFilter('image')}>
            {t('media.images')}
          </FilterChip>
          <FilterChip active={filter === 'video'} onClick={() => setFilter('video')}>
            {t('media.videos')}
          </FilterChip>
          <FilterChip active={filter === 'gif'} onClick={() => setFilter('gif')}>
            {t('media.gifs')}
          </FilterChip>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-8 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 text-xs"
          >
            <option value="date_desc">{t('media.newestFirst')}</option>
            <option value="date_asc">{t('media.oldestFirst')}</option>
            <option value="name">{t('media.name')}</option>
            <option value="size">{t('media.size')}</option>
          </select>
          <div className="ml-auto flex items-center gap-2">
            <SizeToggle size={size} onChange={setSize} />
            <Button type="button" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {t('media.upload')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/*,video/*"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                void uploadFiles(files)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {selectedIds.size > 0 ? (
          <div className="flex items-center justify-between rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2 text-sm">
            <div className="flex items-center gap-2">
              <button type="button" onClick={clearSelection} className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <X className="h-4 w-4" />
              </button>
              {t('media.selected', { count: selectedIds.size })}
              <button type="button" onClick={selectAll} className="text-indigo-600 hover:underline">
                {t('media.selectAll')}
              </button>
            </div>
            <div className="relative flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMoveOpen((o) => !o)}>
                <FolderInput className="h-4 w-4" /> {t('media.moveToFolderBtn')}
              </Button>
              {moveOpen ? (
                <div className="absolute right-0 top-full z-20 mt-1 w-56 max-w-[calc(100vw-1rem)] rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1 text-sm shadow-lg">
                  <button
                    type="button"
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onClick={() => onMove(null)}
                  >
                    {t('media.uncategorizedParen')}
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="block w-full truncate rounded px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      onClick={() => onMove(f.id)}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <Button variant="outline" size="sm" className="text-red-600" onClick={onDeleteSelected}>
                <Trash2 className="h-4 w-4" /> {t('common.delete')}
              </Button>
            </div>
          </div>
        ) : null}

        {refreshing ? (
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Spinner /> {t('media.loading')}
          </div>
        ) : null}

        {assets.length === 0 && uploading.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-10 text-center">
            <Upload className="mx-auto mb-2 h-8 w-8 text-neutral-400 dark:text-neutral-500" />
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('media.dropFilesOrClickUpload')}</p>
          </div>
        ) : (
          <div className={cn('grid gap-3', gridCols)}>
            {assets.map((a) => (
              <MediaAssetCard
                key={a.id}
                asset={a}
                size={size}
                selected={selectedIds.has(a.id)}
                onSelect={toggleSelect}
                onOpen={setPreview}
              />
            ))}
            {uploading.map((name) => (
              <div
                key={name}
                className="flex h-40 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 dark:bg-neutral-900"
              >
                <Spinner />
              </div>
            ))}
          </div>
        )}
      </div>

      {dragActive ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-indigo-500/10">
          <div className="rounded-lg border-2 border-dashed border-indigo-400 bg-white dark:bg-neutral-900 px-8 py-6 text-center shadow">
            <Upload className="mx-auto mb-2 h-8 w-8 text-indigo-500" />
            <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{t('media.dropToUpload')}</p>
          </div>
        </div>
      ) : null}

      <MediaPreviewModal
        asset={preview}
        onClose={() => setPreview(null)}
        onDelete={onDeleteSingle}
      />
    </div>
  )
}

function FilterChip({
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
        'rounded-full px-3 py-1 text-xs font-medium',
        active ? 'bg-neutral-900 text-white' : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-800',
      )}
    >
      {children}
    </button>
  )
}

const SIZE_LABELS = {
  sm: 'media.sizeSmall',
  md: 'media.sizeMedium',
  lg: 'media.sizeLarge',
} as const

function SizeToggle({ size, onChange }: { size: Size; onChange: (s: Size) => void }) {
  const t = useT()
  return (
    <div className="flex rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0.5 text-xs">
      {(['sm', 'md', 'lg'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn('rounded px-2 py-0.5', size === s && 'bg-neutral-900 text-white')}
        >
          {t(SIZE_LABELS[s])}
        </button>
      ))}
    </div>
  )
}
