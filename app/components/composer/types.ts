import type { PlatformKey } from '~/lib/platforms'

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
