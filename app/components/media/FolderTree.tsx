import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderPlus, Pencil, Trash2, MoreHorizontal, Inbox } from 'lucide-react'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import type { FolderNode } from '~/server/media'

export type SelectedFolder = 'all' | 'uncategorized' | string

type TreeNode = FolderNode & { children: TreeNode[] }

function buildTree(folders: FolderNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const f of folders) byId.set(f.id, { ...f, children: [] })
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

export function FolderTree({
  folders,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  folders: FolderNode[]
  selected: SelectedFolder
  onSelect: (v: SelectedFolder) => void
  onCreate: (name: string, parentId: string | null) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const tree = useMemo(() => buildTree(folders), [folders])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  return (
    <div className="w-56 shrink-0 space-y-1 border-r border-neutral-200 pr-3">
      <button
        type="button"
        onClick={() => onSelect('all')}
        className={cn(
          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm',
          selected === 'all' ? 'bg-indigo-50 text-indigo-700' : 'text-neutral-700 hover:bg-neutral-100',
        )}
      >
        <Folder className="h-4 w-4" /> All Media
      </button>
      <button
        type="button"
        onClick={() => onSelect('uncategorized')}
        className={cn(
          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm',
          selected === 'uncategorized'
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-neutral-600 hover:bg-neutral-100',
        )}
      >
        <Inbox className="h-4 w-4" /> Uncategorized
      </button>
      <div className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
        Folders
      </div>
      {tree.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          selected={selected}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          onCreate={onCreate}
        />
      ))}
      {creating ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (newName.trim()) {
              await onCreate(newName.trim(), null)
              setNewName('')
              setCreating(false)
            }
          }}
          className="flex gap-1 pt-1"
        >
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Folder name"
            className="h-8"
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(true)} className="mt-1">
          <FolderPlus className="h-4 w-4" /> New Folder
        </Button>
      )}
    </div>
  )
}

function TreeRow({
  node,
  depth,
  selected,
  onSelect,
  onRename,
  onDelete,
  onCreate,
}: {
  node: TreeNode
  depth: number
  selected: SelectedFolder
  onSelect: (v: SelectedFolder) => void
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCreate: (name: string, parentId: string | null) => Promise<void>
}) {
  const [open, setOpen] = useState(true)
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(node.name)
  const [creatingChild, setCreatingChild] = useState(false)
  const [childName, setChildName] = useState('')
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div className="group relative flex items-center">
        <button
          type="button"
          onClick={() => hasChildren && setOpen((o) => !o)}
          className={cn('shrink-0 p-0.5 text-neutral-400', !hasChildren && 'invisible')}
          aria-label="Toggle"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {renaming ? (
          <form
            className="flex flex-1 gap-1"
            onSubmit={async (e) => {
              e.preventDefault()
              await onRename(node.id, renameVal)
              setRenaming(false)
            }}
          >
            <Input
              autoFocus
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              className="h-7"
            />
            <Button type="submit" size="sm">
              Save
            </Button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              className={cn(
                'flex flex-1 items-center gap-2 rounded px-1.5 py-1 text-left text-sm',
                selected === node.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-neutral-700 hover:bg-neutral-100',
              )}
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              <Folder className="h-4 w-4" />
              <span className="truncate">{node.name}</span>
            </button>
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              className="rounded p-1 text-neutral-400 opacity-0 hover:bg-neutral-100 group-hover:opacity-100"
              aria-label="Folder menu"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menu ? (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-neutral-200 bg-white p-1 text-sm shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100"
                  onClick={() => {
                    setMenu(false)
                    setCreatingChild(true)
                  }}
                >
                  <FolderPlus className="h-3 w-3" /> New subfolder
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100"
                  onClick={() => {
                    setMenu(false)
                    setRenaming(true)
                  }}
                >
                  <Pencil className="h-3 w-3" /> Rename
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    setMenu(false)
                    if (confirm(`Delete folder "${node.name}"? Assets will be unfiled.`)) {
                      await onDelete(node.id)
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {creatingChild ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (childName.trim()) {
              await onCreate(childName.trim(), node.id)
              setChildName('')
              setCreatingChild(false)
            }
          }}
          className="mt-1 flex gap-1"
          style={{ paddingLeft: 24 + depth * 12 }}
        >
          <Input
            autoFocus
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            className="h-7"
            placeholder="Subfolder name"
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      ) : null}
      {open && hasChildren ? (
        <div>
          {node.children.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onCreate={onCreate}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
