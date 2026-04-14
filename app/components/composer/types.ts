import type { PlatformKey } from '~/lib/platforms'
import type { LoadedPost } from '~/server/composer'

export type MediaAsset = {
  id: string
  url: string
  originalName: string
  mimeType: string
  size: number
}

export type ThreadPart = {
  id: string
  content: string
  mediaIds: string[]
}

export type Version = {
  id: string
  label: string
  platforms: PlatformKey[]
  content: string
  firstCommentEnabled: boolean
  firstComment: string
  isThread: boolean
  threadParts: ThreadPart[]
  mediaIds: string[]
  isDefault: boolean
}

export type RedditFields = {
  title: string
  subreddit: string
  postType: 'text' | 'link' | 'image' | 'video'
  nsfw: boolean
  spoiler: boolean
}

export type StartMode = 'shared' | 'independent'

export type ComposerState = {
  startMode: StartMode
  selectedAccountIds: string[]
  versions: Version[]
  activeVersionId: string
  mediaById: Record<string, MediaAsset>
  reddit: RedditFields
}

export type ConnectedAccount = {
  id: string
  platform: PlatformKey
  accountName: string
  accountHandle: string
  avatarUrl: string | null
}

export function makeId() {
  return Math.random().toString(36).slice(2, 10)
}

export function defaultRedditFields(): RedditFields {
  return { title: '', subreddit: '', postType: 'text', nsfw: false, spoiler: false }
}

export function hydrateStateFromPost(post: LoadedPost): ComposerState {
  const versions: Version[] = post.versions.map((v) => ({
    id: v.id,
    label: v.isDefault ? 'Default' : v.platforms.map((p) => p).join(' + ') || 'Version',
    platforms: v.platforms,
    content: v.content,
    firstCommentEnabled: v.firstCommentEnabled,
    firstComment: v.firstComment ?? '',
    isThread: v.isThread,
    threadParts:
      v.threadParts.length > 0
        ? v.threadParts.map((p) => ({ id: makeId(), content: p.content, mediaIds: p.mediaIds }))
        : [{ id: makeId(), content: '', mediaIds: [] }],
    mediaIds: v.mediaIds,
    isDefault: v.isDefault,
  }))
  if (versions.length === 0) return initialState()
  const mediaById: Record<string, MediaAsset> = {}
  for (const [id, m] of Object.entries(post.mediaById)) {
    mediaById[id] = {
      id: m.id,
      url: m.url,
      originalName: m.originalName,
      mimeType: m.mimeType,
      size: m.size,
    }
  }
  const defaultV = versions.find((v) => v.isDefault) ?? versions[0]!
  return {
    startMode: post.mode,
    selectedAccountIds: post.selectedAccountIds,
    versions,
    activeVersionId: defaultV.id,
    mediaById,
    reddit: defaultRedditFields(),
  }
}

export function initialState(): ComposerState {
  const defaultId = makeId()
  return {
    startMode: 'shared',
    selectedAccountIds: [],
    versions: [
      {
        id: defaultId,
        label: 'Default',
        platforms: [],
        content: '',
        firstCommentEnabled: false,
        firstComment: '',
        isThread: false,
        threadParts: [{ id: makeId(), content: '', mediaIds: [] }],
        mediaIds: [],
        isDefault: true,
      },
    ],
    activeVersionId: defaultId,
    mediaById: {},
    reddit: defaultRedditFields(),
  }
}
