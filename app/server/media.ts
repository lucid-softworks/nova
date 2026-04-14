import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  listFoldersImpl,
  createFolderImpl,
  renameFolderImpl,
  deleteFolderImpl,
  listAssetsImpl,
  moveAssetsImpl,
  deleteAssetsImpl,
  type AssetListQuery,
  type AssetSummary,
  type FolderNode,
} from './media.server'

export type { FolderNode, AssetSummary, AssetListQuery }

const wsInput = z.object({ workspaceSlug: z.string().min(1) })

export const listFolders = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => wsInput.parse(d))
  .handler(async ({ data }) => listFoldersImpl(data.workspaceSlug))

const listAssetsSchema = z.object({
  workspaceSlug: z.string().min(1),
  folderId: z.string().nullable(),
  search: z.string().nullable(),
  filter: z.enum(['all', 'image', 'video', 'gif']),
  sort: z.enum(['date_desc', 'date_asc', 'name', 'size']),
})

export const listAssets = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => listAssetsSchema.parse(d))
  .handler(async ({ data }) => listAssetsImpl(data))

const createFolderSchema = z.object({
  workspaceSlug: z.string().min(1),
  name: z.string().min(1).max(120),
  parentId: z.string().uuid().nullable(),
})

export const createFolder = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => createFolderSchema.parse(d))
  .handler(async ({ data }) => createFolderImpl(data.workspaceSlug, data.name, data.parentId))

const renameFolderSchema = z.object({
  workspaceSlug: z.string().min(1),
  folderId: z.string().uuid(),
  name: z.string().min(1).max(120),
})

export const renameFolder = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => renameFolderSchema.parse(d))
  .handler(async ({ data }) => renameFolderImpl(data.workspaceSlug, data.folderId, data.name))

const deleteFolderSchema = z.object({
  workspaceSlug: z.string().min(1),
  folderId: z.string().uuid(),
})

export const deleteFolder = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteFolderSchema.parse(d))
  .handler(async ({ data }) => deleteFolderImpl(data.workspaceSlug, data.folderId))

const moveAssetsSchema = z.object({
  workspaceSlug: z.string().min(1),
  assetIds: z.array(z.string().uuid()),
  folderId: z.string().uuid().nullable(),
})

export const moveAssets = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => moveAssetsSchema.parse(d))
  .handler(async ({ data }) => moveAssetsImpl(data.workspaceSlug, data.assetIds, data.folderId))

const deleteAssetsSchema = z.object({
  workspaceSlug: z.string().min(1),
  assetIds: z.array(z.string().uuid()),
})

export const deleteAssets = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => deleteAssetsSchema.parse(d))
  .handler(async ({ data }) => deleteAssetsImpl(data.workspaceSlug, data.assetIds))
