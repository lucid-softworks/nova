import type { PlatformKey } from '~/lib/platforms'
import type { AnalyticsAdapter } from './types'

import * as bluesky from './platforms/bluesky'
import * as x from './platforms/x'
import * as linkedin from './platforms/linkedin'
import * as facebook from './platforms/facebook'
import * as instagram from './platforms/instagram'
import * as threads from './platforms/threads'
import * as mastodon from './platforms/mastodon'
import * as tumblr from './platforms/tumblr'
import * as reddit from './platforms/reddit'
import * as tiktok from './platforms/tiktok'
import * as youtube from './platforms/youtube'
import * as pinterest from './platforms/pinterest'

export const adapters: Record<PlatformKey, AnalyticsAdapter> = {
  bluesky,
  x,
  linkedin,
  facebook,
  instagram,
  threads,
  mastodon,
  tumblr,
  reddit,
  tiktok,
  youtube,
  pinterest,
}

export type { AnalyticsAdapter, AnalyticsAccountCtx, AccountSnapshot, PostSnapshot } from './types'
