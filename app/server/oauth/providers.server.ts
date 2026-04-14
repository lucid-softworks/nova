import type { PlatformKey } from '~/lib/platforms'
import { PLATFORMS } from '~/lib/platforms'

export interface OAuthProviderConfig {
  clientId: string
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
  meEndpoint: string
  usePKCE?: boolean
  extraAuthorizeParams?: Record<string, string>
  parseUser: (raw: unknown) => { accountName: string; accountHandle: string; avatarUrl: string | null; extra?: Record<string, unknown> }
}

const env = (key: string): string | null => process.env[key] || null

export type ProviderRegistry = Partial<Record<Exclude<PlatformKey, 'bluesky' | 'mastodon'>, OAuthProviderConfig>>

type RawObject = Record<string, unknown>

function coerce(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function buildProviderRegistry(): ProviderRegistry {
  const reg: ProviderRegistry = {}

  if (env('FACEBOOK_APP_ID') && env('FACEBOOK_APP_SECRET')) {
    reg.facebook = {
      clientId: env('FACEBOOK_APP_ID')!,
      clientSecret: env('FACEBOOK_APP_SECRET')!,
      authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
      scopes: PLATFORMS.facebook.oauthScopes,
      meEndpoint: `${PLATFORMS.facebook.meEndpoint}?fields=id,name,picture`,
      parseUser: (raw) => {
        const r = raw as RawObject
        const picture = (r.picture as RawObject | undefined)?.data as RawObject | undefined
        return {
          accountName: coerce(r.name),
          accountHandle: coerce(r.id),
          avatarUrl: coerce(picture?.url, '') || null,
        }
      },
    }
  }

  if (env('INSTAGRAM_APP_ID') && env('INSTAGRAM_APP_SECRET')) {
    reg.instagram = {
      clientId: env('INSTAGRAM_APP_ID')!,
      clientSecret: env('INSTAGRAM_APP_SECRET')!,
      authorizeUrl: 'https://api.instagram.com/oauth/authorize',
      tokenUrl: 'https://api.instagram.com/oauth/access_token',
      scopes: PLATFORMS.instagram.oauthScopes,
      meEndpoint: `${PLATFORMS.instagram.meEndpoint}?fields=id,username,profile_picture_url`,
      parseUser: (raw) => {
        const r = raw as RawObject
        return {
          accountName: coerce(r.username),
          accountHandle: coerce(r.username),
          avatarUrl: coerce(r.profile_picture_url, '') || null,
        }
      },
    }
  }

  if (env('X_CLIENT_ID') && env('X_CLIENT_SECRET')) {
    reg.x = {
      clientId: env('X_CLIENT_ID')!,
      clientSecret: env('X_CLIENT_SECRET')!,
      authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      scopes: PLATFORMS.x.oauthScopes,
      meEndpoint: `${PLATFORMS.x.meEndpoint}?user.fields=profile_image_url,username,name`,
      usePKCE: true,
      parseUser: (raw) => {
        const r = raw as RawObject
        const d = (r.data as RawObject) ?? {}
        return {
          accountName: coerce(d.name),
          accountHandle: coerce(d.username),
          avatarUrl: coerce(d.profile_image_url, '') || null,
        }
      },
    }
  }

  if (env('LINKEDIN_CLIENT_ID') && env('LINKEDIN_CLIENT_SECRET')) {
    reg.linkedin = {
      clientId: env('LINKEDIN_CLIENT_ID')!,
      clientSecret: env('LINKEDIN_CLIENT_SECRET')!,
      authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      scopes: PLATFORMS.linkedin.oauthScopes,
      meEndpoint: PLATFORMS.linkedin.meEndpoint,
      parseUser: (raw) => {
        const r = raw as RawObject
        return {
          accountName: coerce(r.name, coerce(r.given_name)),
          accountHandle: coerce(r.sub, coerce(r.email)),
          avatarUrl: coerce(r.picture, '') || null,
        }
      },
    }
  }

  if (env('TIKTOK_CLIENT_KEY') && env('TIKTOK_CLIENT_SECRET')) {
    reg.tiktok = {
      clientId: env('TIKTOK_CLIENT_KEY')!,
      clientSecret: env('TIKTOK_CLIENT_SECRET')!,
      authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize',
      tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
      scopes: PLATFORMS.tiktok.oauthScopes,
      meEndpoint: `${PLATFORMS.tiktok.meEndpoint}?fields=display_name,avatar_url,open_id,union_id`,
      parseUser: (raw) => {
        const r = raw as RawObject
        const d = ((r.data as RawObject)?.user as RawObject) ?? {}
        return {
          accountName: coerce(d.display_name),
          accountHandle: coerce(d.open_id),
          avatarUrl: coerce(d.avatar_url, '') || null,
        }
      },
    }
  }

  if (env('YOUTUBE_CLIENT_ID') && env('YOUTUBE_CLIENT_SECRET')) {
    reg.youtube = {
      clientId: env('YOUTUBE_CLIENT_ID')!,
      clientSecret: env('YOUTUBE_CLIENT_SECRET')!,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: PLATFORMS.youtube.oauthScopes,
      meEndpoint: PLATFORMS.youtube.meEndpoint,
      extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
      parseUser: (raw) => {
        const r = raw as RawObject
        const items = r.items as RawObject[] | undefined
        const snippet = (items?.[0]?.snippet as RawObject) ?? {}
        const thumbnails = (snippet.thumbnails as RawObject)?.default as RawObject | undefined
        return {
          accountName: coerce(snippet.title),
          accountHandle: coerce(snippet.customUrl, coerce(items?.[0]?.id)),
          avatarUrl: coerce(thumbnails?.url, '') || null,
          extra: { channelId: coerce(items?.[0]?.id) },
        }
      },
    }
  }

  if (env('PINTEREST_APP_ID') && env('PINTEREST_APP_SECRET')) {
    reg.pinterest = {
      clientId: env('PINTEREST_APP_ID')!,
      clientSecret: env('PINTEREST_APP_SECRET')!,
      authorizeUrl: 'https://www.pinterest.com/oauth/',
      tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
      scopes: PLATFORMS.pinterest.oauthScopes,
      meEndpoint: PLATFORMS.pinterest.meEndpoint,
      parseUser: (raw) => {
        const r = raw as RawObject
        return {
          accountName: coerce(r.username),
          accountHandle: coerce(r.username),
          avatarUrl: coerce(r.profile_image, '') || null,
        }
      },
    }
  }

  if (env('THREADS_APP_ID') && env('THREADS_APP_SECRET')) {
    reg.threads = {
      clientId: env('THREADS_APP_ID')!,
      clientSecret: env('THREADS_APP_SECRET')!,
      authorizeUrl: 'https://threads.net/oauth/authorize',
      tokenUrl: 'https://graph.threads.net/oauth/access_token',
      scopes: PLATFORMS.threads.oauthScopes,
      meEndpoint: `${PLATFORMS.threads.meEndpoint}?fields=id,username,threads_profile_picture_url`,
      parseUser: (raw) => {
        const r = raw as RawObject
        return {
          accountName: coerce(r.username),
          accountHandle: coerce(r.username),
          avatarUrl: coerce(r.threads_profile_picture_url, '') || null,
        }
      },
    }
  }

  if (env('TUMBLR_CONSUMER_KEY') && env('TUMBLR_CONSUMER_SECRET')) {
    reg.tumblr = {
      clientId: env('TUMBLR_CONSUMER_KEY')!,
      clientSecret: env('TUMBLR_CONSUMER_SECRET')!,
      authorizeUrl: 'https://www.tumblr.com/oauth2/authorize',
      tokenUrl: 'https://api.tumblr.com/v2/oauth2/token',
      scopes: PLATFORMS.tumblr.oauthScopes,
      meEndpoint: PLATFORMS.tumblr.meEndpoint,
      parseUser: (raw) => {
        const r = raw as RawObject
        const user = ((r.response as RawObject)?.user as RawObject) ?? {}
        return {
          accountName: coerce(user.name),
          accountHandle: coerce(user.name),
          avatarUrl: null,
        }
      },
    }
  }

  if (env('REDDIT_CLIENT_ID') && env('REDDIT_CLIENT_SECRET')) {
    reg.reddit = {
      clientId: env('REDDIT_CLIENT_ID')!,
      clientSecret: env('REDDIT_CLIENT_SECRET')!,
      authorizeUrl: 'https://www.reddit.com/api/v1/authorize',
      tokenUrl: 'https://www.reddit.com/api/v1/access_token',
      scopes: PLATFORMS.reddit.oauthScopes,
      meEndpoint: PLATFORMS.reddit.meEndpoint,
      extraAuthorizeParams: { duration: 'permanent' },
      parseUser: (raw) => {
        const r = raw as RawObject
        return {
          accountName: coerce(r.name),
          accountHandle: coerce(r.name),
          avatarUrl: coerce(r.icon_img, '') || null,
        }
      },
    }
  }

  return reg
}
