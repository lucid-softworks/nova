import type { PlatformKey } from '~/lib/platforms'
import {
  defaultRedditFields,
  makeId,
  type ComposerState,
  type ConnectedAccount,
  type MediaAsset,
  type StartMode,
  type Version,
} from './types'

export type Action =
  | { type: 'SET_START_MODE'; mode: StartMode; accounts: ConnectedAccount[] }
  | { type: 'TOGGLE_ACCOUNT'; accountId: string; accounts: ConnectedAccount[] }
  | { type: 'ADD_VERSION'; platforms: PlatformKey[] }
  | { type: 'REMOVE_VERSION'; versionId: string }
  | { type: 'SET_ACTIVE'; versionId: string }
  | { type: 'UPDATE_CONTENT'; versionId: string; content: string }
  | { type: 'SET_FIRST_COMMENT_ENABLED'; versionId: string; value: boolean }
  | { type: 'UPDATE_FIRST_COMMENT'; versionId: string; value: string }
  | { type: 'TOGGLE_THREAD'; versionId: string; value: boolean }
  | { type: 'THREAD_ADD'; versionId: string }
  | { type: 'THREAD_REMOVE'; versionId: string; partId: string }
  | { type: 'THREAD_UPDATE'; versionId: string; partId: string; value: string }
  | { type: 'THREAD_MOVE'; versionId: string; partId: string; direction: 'up' | 'down' }
  | { type: 'ADD_MEDIA'; versionId: string; assets: MediaAsset[] }
  | { type: 'REMOVE_MEDIA'; versionId: string; mediaId: string }
  | { type: 'SET_ALT_TEXT'; versionId: string; mediaId: string; value: string }
  | { type: 'TOGGLE_BLUESKY_LABEL'; versionId: string; label: string }
  | { type: 'UPDATE_REDDIT'; patch: Partial<ComposerState['reddit']> }
  | { type: 'RESET'; state: ComposerState }

function platformsForAccounts(ids: string[], accounts: ConnectedAccount[]): PlatformKey[] {
  const set = new Set<PlatformKey>()
  for (const id of ids) {
    const acct = accounts.find((a) => a.id === id)
    if (acct) set.add(acct.platform)
  }
  return [...set]
}

function updateVersion(state: ComposerState, id: string, patch: Partial<Version>): ComposerState {
  return {
    ...state,
    versions: state.versions.map((v) => (v.id === id ? { ...v, ...patch } : v)),
  }
}

function syncSharedVersions(state: ComposerState, platforms: PlatformKey[]): ComposerState {
  // In shared mode: keep the Default version, let other versions cover subsets; remove versions
  // whose platforms no longer exist; ensure Default covers every unclaimed platform.
  const claimedByOverrides = new Set<PlatformKey>()
  const versions = state.versions
    .map((v) => {
      if (v.isDefault) return v
      const filtered = v.platforms.filter((p) => platforms.includes(p))
      filtered.forEach((p) => claimedByOverrides.add(p))
      return { ...v, platforms: filtered }
    })
    .filter((v) => v.isDefault || v.platforms.length > 0)

  const defaultPlatforms = platforms.filter((p) => !claimedByOverrides.has(p))
  const next = versions.map((v) =>
    v.isDefault ? { ...v, platforms: defaultPlatforms } : v,
  )
  const active = next.find((v) => v.id === state.activeVersionId) ?? next[0]!
  return { ...state, versions: next, activeVersionId: active.id }
}

function syncIndependentVersions(
  state: ComposerState,
  platforms: PlatformKey[],
): ComposerState {
  // Independent mode: each selected platform gets its own version. No Default.
  const keep: Version[] = []
  for (const v of state.versions) {
    if (v.isDefault) continue
    const plat = v.platforms[0]
    if (plat && platforms.includes(plat)) keep.push({ ...v, platforms: [plat] })
  }
  const existing = new Set(keep.map((v) => v.platforms[0]!))
  for (const p of platforms) {
    if (!existing.has(p)) {
      keep.push({
        id: makeId(),
        label: p,
        platforms: [p],
        content: '',
        firstCommentEnabled: false,
        firstComment: '',
        isThread: false,
        threadParts: [{ id: makeId(), content: '', mediaIds: [] }],
        mediaIds: [], altTextByMediaId: {}, blueskyLabels: [],
        isDefault: false,
      })
    }
  }
  if (keep.length === 0) {
    // keep an empty default so the UI has something to show
    const id = makeId()
    keep.push({
      id,
      label: 'Default',
      platforms: [],
      content: '',
      firstCommentEnabled: false,
      firstComment: '',
      isThread: false,
      threadParts: [{ id: makeId(), content: '', mediaIds: [] }],
      mediaIds: [], altTextByMediaId: {}, blueskyLabels: [],
      isDefault: true,
    })
  }
  const active = keep.find((v) => v.id === state.activeVersionId) ?? keep[0]!
  return { ...state, versions: keep, activeVersionId: active.id }
}

function resync(state: ComposerState, accounts: ConnectedAccount[]): ComposerState {
  const platforms = platformsForAccounts(state.selectedAccountIds, accounts)
  return state.startMode === 'shared'
    ? syncSharedVersions(state, platforms)
    : syncIndependentVersions(state, platforms)
}

export function composerReducer(state: ComposerState, action: Action): ComposerState {
  switch (action.type) {
    case 'RESET':
      return action.state
    case 'SET_START_MODE': {
      // Going from independent → shared can leave us without any default
      // version (independent mode drops it entirely). Re-add an empty
      // default and promote existing per-platform versions to overrides so
      // the user doesn't lose their drafts when switching back.
      if (action.mode === 'shared' && !state.versions.some((v) => v.isDefault)) {
        const defaultId = makeId()
        const restored: Version = {
          id: defaultId,
          label: 'Default',
          platforms: [],
          content: '',
          firstCommentEnabled: false,
          firstComment: '',
          isThread: false,
          threadParts: [{ id: makeId(), content: '', mediaIds: [] }],
          mediaIds: [],
          altTextByMediaId: {},
          blueskyLabels: [],
          isDefault: true,
        }
        return resync(
          {
            ...state,
            startMode: 'shared',
            versions: [restored, ...state.versions],
            activeVersionId: defaultId,
          },
          action.accounts,
        )
      }
      const cleared: ComposerState = {
        ...state,
        startMode: action.mode,
        versions: state.versions.map((v) =>
          v.isDefault
            ? { ...v, content: v.content, platforms: [] }
            : v,
        ),
      }
      if (action.mode === 'independent') {
        const dropDefault = cleared.versions.filter((v) => !v.isDefault)
        if (dropDefault.length === 0) {
          const id = makeId()
          dropDefault.push({
            id,
            label: 'Default',
            platforms: [],
            content: '',
            firstCommentEnabled: false,
            firstComment: '',
            isThread: false,
            threadParts: [{ id: makeId(), content: '', mediaIds: [] }],
            mediaIds: [], altTextByMediaId: {}, blueskyLabels: [],
            isDefault: true,
          })
        }
        return resync(
          { ...cleared, versions: dropDefault, activeVersionId: dropDefault[0]!.id },
          action.accounts,
        )
      }
      return resync(cleared, action.accounts)
    }
    case 'TOGGLE_ACCOUNT': {
      const set = new Set(state.selectedAccountIds)
      if (set.has(action.accountId)) set.delete(action.accountId)
      else set.add(action.accountId)
      return resync({ ...state, selectedAccountIds: [...set] }, action.accounts)
    }
    case 'ADD_VERSION': {
      const id = makeId()
      const label = action.platforms.length === 1 ? action.platforms[0]! : `Group (${action.platforms.length})`
      // Strip these platforms from the default or other versions
      const versions = state.versions.map((v) => {
        if (v.isDefault) return { ...v, platforms: v.platforms.filter((p) => !action.platforms.includes(p)) }
        return { ...v, platforms: v.platforms.filter((p) => !action.platforms.includes(p)) }
      })
      const next = [
        ...versions,
        {
          id,
          label,
          platforms: action.platforms,
          content: '',
          firstCommentEnabled: false,
          firstComment: '',
          isThread: false,
          threadParts: [{ id: makeId(), content: '', mediaIds: [] }],
          mediaIds: [], altTextByMediaId: {}, blueskyLabels: [],
          isDefault: false,
        } satisfies Version,
      ].filter((v) => v.isDefault || v.platforms.length > 0)
      return { ...state, versions: next, activeVersionId: id }
    }
    case 'REMOVE_VERSION': {
      const version = state.versions.find((v) => v.id === action.versionId)
      if (!version || version.isDefault) return state
      const reclaim = version.platforms
      const versions = state.versions
        .filter((v) => v.id !== action.versionId)
        .map((v) => (v.isDefault ? { ...v, platforms: [...v.platforms, ...reclaim] } : v))
      const active = versions[0]!
      return { ...state, versions, activeVersionId: active.id }
    }
    case 'SET_ACTIVE':
      return { ...state, activeVersionId: action.versionId }
    case 'UPDATE_CONTENT':
      return updateVersion(state, action.versionId, { content: action.content })
    case 'SET_FIRST_COMMENT_ENABLED':
      return updateVersion(state, action.versionId, { firstCommentEnabled: action.value })
    case 'UPDATE_FIRST_COMMENT':
      return updateVersion(state, action.versionId, { firstComment: action.value })
    case 'TOGGLE_THREAD': {
      const version = state.versions.find((v) => v.id === action.versionId)
      if (!version) return state
      if (action.value) {
        // Turning thread mode ON: migrate the main content field into the
        // first thread part so we don't publish an empty leading tweet.
        const parts = [...version.threadParts]
        const first = parts[0]
        if (first && !first.content.trim() && version.content) {
          parts[0] = { ...first, content: version.content }
        }
        return updateVersion(state, action.versionId, {
          isThread: true,
          threadParts: parts,
        })
      }
      // Turning thread mode OFF: if the main content is empty but the
      // first part has text, fold it back so the draft still publishes.
      if (!version.content.trim() && version.threadParts[0]?.content) {
        return updateVersion(state, action.versionId, {
          isThread: false,
          content: version.threadParts[0].content,
        })
      }
      return updateVersion(state, action.versionId, { isThread: false })
    }
    case 'THREAD_ADD': {
      const version = state.versions.find((v) => v.id === action.versionId)
      if (!version) return state
      return updateVersion(state, action.versionId, {
        threadParts: [...version.threadParts, { id: makeId(), content: '', mediaIds: [] }],
      })
    }
    case 'THREAD_REMOVE': {
      const version = state.versions.find((v) => v.id === action.versionId)
      if (!version) return state
      const parts = version.threadParts.filter((p) => p.id !== action.partId)
      return updateVersion(state, action.versionId, {
        threadParts: parts.length > 0 ? parts : [{ id: makeId(), content: '', mediaIds: [] }],
      })
    }
    case 'THREAD_UPDATE': {
      const version = state.versions.find((v) => v.id === action.versionId)
      if (!version) return state
      return updateVersion(state, action.versionId, {
        threadParts: version.threadParts.map((p) =>
          p.id === action.partId ? { ...p, content: action.value } : p,
        ),
      })
    }
    case 'THREAD_MOVE': {
      const version = state.versions.find((v) => v.id === action.versionId)
      if (!version) return state
      const idx = version.threadParts.findIndex((p) => p.id === action.partId)
      if (idx < 0) return state
      const swapWith = action.direction === 'up' ? idx - 1 : idx + 1
      if (swapWith < 0 || swapWith >= version.threadParts.length) return state
      const next = [...version.threadParts]
      const a = next[idx]!
      const b = next[swapWith]!
      next[idx] = b
      next[swapWith] = a
      return updateVersion(state, action.versionId, { threadParts: next })
    }
    case 'ADD_MEDIA': {
      const version = state.versions.find((v) => v.id === action.versionId)
      if (!version) return state
      const mediaById = { ...state.mediaById }
      for (const a of action.assets) mediaById[a.id] = a
      return {
        ...updateVersion(state, action.versionId, {
          mediaIds: [...version.mediaIds, ...action.assets.map((a) => a.id)],
        }),
        mediaById,
      }
    }
    case 'REMOVE_MEDIA': {
      const version = state.versions.find((v) => v.id === action.versionId)
      if (!version) return state
      const { [action.mediaId]: _removed, ...restAlt } = version.altTextByMediaId
      return updateVersion(state, action.versionId, {
        mediaIds: version.mediaIds.filter((id) => id !== action.mediaId),
        altTextByMediaId: restAlt,
      })
    }
    case 'SET_ALT_TEXT': {
      const version = state.versions.find((v) => v.id === action.versionId)
      if (!version) return state
      return updateVersion(state, action.versionId, {
        altTextByMediaId: { ...version.altTextByMediaId, [action.mediaId]: action.value },
      })
    }
    case 'TOGGLE_BLUESKY_LABEL': {
      const version = state.versions.find((v) => v.id === action.versionId)
      if (!version) return state
      const set = new Set(version.blueskyLabels)
      if (set.has(action.label)) set.delete(action.label)
      else set.add(action.label)
      return updateVersion(state, action.versionId, { blueskyLabels: [...set] })
    }
    case 'UPDATE_REDDIT':
      return { ...state, reddit: { ...state.reddit, ...action.patch } }
    default:
      return state
  }
}

export { defaultRedditFields }
