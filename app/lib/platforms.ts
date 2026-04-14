export const PLATFORM_KEYS = [
  'facebook',
  'instagram',
  'threads',
  'x',
  'linkedin',
  'youtube',
  'tiktok',
  'pinterest',
  'mastodon',
  'bluesky',
  'tumblr',
  'reddit',
] as const

export type PlatformKey = (typeof PLATFORM_KEYS)[number]

export type ReshareType = 'repost' | 'quote' | 'reblog' | 'boost' | 'crosspost' | 'share'

export interface PlatformMediaRequirements {
  maxFileSizeMb: number
  acceptedVideoFormats: string[]
  acceptedImageFormats: string[]
  maxVideoDurationSeconds: number
  recommendedAspectRatios: string[]
  requiredAspectRatios: string[] | null
  maxImages: number
  maxVideos: number
}

export interface PlatformConfig {
  key: PlatformKey
  label: string
  color: string
  textLimit: number
  supportsFirstComment: boolean
  supportsThreads: boolean
  supportsReels: boolean
  supportsReshare: boolean
  reshareTypes: ReshareType[]
  supportsHashtagSearch: boolean
  supportsUrlVariable: boolean
  urlVariableName: string | null
  oauthScopes: string[]
  meEndpoint: string
  mediaRequirements: PlatformMediaRequirements
}

const commonImage = ['jpg', 'jpeg', 'png', 'webp', 'gif']
const commonVideo = ['mp4', 'mov']

export const PLATFORMS: Record<PlatformKey, PlatformConfig> = {
  facebook: {
    key: 'facebook',
    label: 'Facebook',
    color: '#1877f2',
    textLimit: 63206,
    supportsFirstComment: true,
    supportsThreads: false,
    supportsReels: true,
    supportsReshare: true,
    reshareTypes: ['share'],
    supportsHashtagSearch: false,
    supportsUrlVariable: true,
    urlVariableName: 'facebook_url',
    oauthScopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
    meEndpoint: 'https://graph.facebook.com/v21.0/me',
    mediaRequirements: {
      maxFileSizeMb: 1024,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: commonImage,
      maxVideoDurationSeconds: 14400,
      recommendedAspectRatios: ['16:9', '1:1', '9:16'],
      requiredAspectRatios: null,
      maxImages: 10,
      maxVideos: 1,
    },
  },
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    color: '#e1306c',
    textLimit: 2200,
    supportsFirstComment: true,
    supportsThreads: false,
    supportsReels: true,
    supportsReshare: false,
    reshareTypes: [],
    supportsHashtagSearch: true,
    supportsUrlVariable: true,
    urlVariableName: 'instagram_url',
    oauthScopes: [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights',
    ],
    meEndpoint: 'https://graph.instagram.com/me',
    mediaRequirements: {
      maxFileSizeMb: 100,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: commonImage,
      maxVideoDurationSeconds: 60,
      recommendedAspectRatios: ['1:1', '4:5', '9:16'],
      requiredAspectRatios: ['1:1', '4:5', '9:16'],
      maxImages: 10,
      maxVideos: 1,
    },
  },
  threads: {
    key: 'threads',
    label: 'Threads',
    color: '#000000',
    textLimit: 500,
    supportsFirstComment: false,
    supportsThreads: true,
    supportsReels: false,
    supportsReshare: true,
    reshareTypes: ['repost'],
    supportsHashtagSearch: false,
    supportsUrlVariable: true,
    urlVariableName: 'threads_url',
    oauthScopes: ['threads_basic', 'threads_content_publish'],
    meEndpoint: 'https://graph.threads.net/v1.0/me',
    mediaRequirements: {
      maxFileSizeMb: 100,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: commonImage,
      maxVideoDurationSeconds: 300,
      recommendedAspectRatios: ['1:1', '4:5'],
      requiredAspectRatios: null,
      maxImages: 10,
      maxVideos: 1,
    },
  },
  x: {
    key: 'x',
    label: 'X (Twitter)',
    color: '#000000',
    textLimit: 280,
    supportsFirstComment: false,
    supportsThreads: true,
    supportsReels: false,
    supportsReshare: true,
    reshareTypes: ['repost', 'quote'],
    supportsHashtagSearch: true,
    supportsUrlVariable: true,
    urlVariableName: 'x_url',
    oauthScopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    meEndpoint: 'https://api.twitter.com/2/users/me',
    mediaRequirements: {
      maxFileSizeMb: 512,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: commonImage,
      maxVideoDurationSeconds: 140,
      recommendedAspectRatios: ['16:9', '1:1'],
      requiredAspectRatios: null,
      maxImages: 4,
      maxVideos: 1,
    },
  },
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn',
    color: '#0a66c2',
    textLimit: 3000,
    supportsFirstComment: true,
    supportsThreads: false,
    supportsReels: false,
    supportsReshare: true,
    reshareTypes: ['repost', 'quote'],
    supportsHashtagSearch: true,
    supportsUrlVariable: true,
    urlVariableName: 'linkedin_url',
    oauthScopes: ['w_member_social', 'r_organization_social', 'r_liteprofile'],
    meEndpoint: 'https://api.linkedin.com/v2/userinfo',
    mediaRequirements: {
      maxFileSizeMb: 200,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: commonImage,
      maxVideoDurationSeconds: 600,
      recommendedAspectRatios: ['1:1', '1.91:1'],
      requiredAspectRatios: null,
      maxImages: 9,
      maxVideos: 1,
    },
  },
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    color: '#ff0000',
    textLimit: 5000,
    supportsFirstComment: false,
    supportsThreads: false,
    supportsReels: true,
    supportsReshare: false,
    reshareTypes: [],
    supportsHashtagSearch: true,
    supportsUrlVariable: true,
    urlVariableName: 'youtube_url',
    oauthScopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    meEndpoint: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    mediaRequirements: {
      maxFileSizeMb: 262144,
      acceptedVideoFormats: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
      acceptedImageFormats: [],
      maxVideoDurationSeconds: 43200,
      recommendedAspectRatios: ['16:9', '9:16'],
      requiredAspectRatios: ['16:9', '9:16'],
      maxImages: 0,
      maxVideos: 1,
    },
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    color: '#010101',
    textLimit: 2200,
    supportsFirstComment: false,
    supportsThreads: false,
    supportsReels: true,
    supportsReshare: false,
    reshareTypes: [],
    supportsHashtagSearch: true,
    supportsUrlVariable: true,
    urlVariableName: 'tiktok_url',
    oauthScopes: ['video.publish', 'video.upload', 'user.info.basic'],
    meEndpoint: 'https://open.tiktokapis.com/v2/user/info/',
    mediaRequirements: {
      maxFileSizeMb: 500,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: [],
      maxVideoDurationSeconds: 600,
      recommendedAspectRatios: ['9:16'],
      requiredAspectRatios: ['9:16'],
      maxImages: 0,
      maxVideos: 1,
    },
  },
  pinterest: {
    key: 'pinterest',
    label: 'Pinterest',
    color: '#e60023',
    textLimit: 500,
    supportsFirstComment: false,
    supportsThreads: false,
    supportsReels: false,
    supportsReshare: false,
    reshareTypes: [],
    supportsHashtagSearch: false,
    supportsUrlVariable: true,
    urlVariableName: 'pinterest_url',
    oauthScopes: ['pins:read', 'pins:write', 'boards:read'],
    meEndpoint: 'https://api.pinterest.com/v5/user_account',
    mediaRequirements: {
      maxFileSizeMb: 32,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: commonImage,
      maxVideoDurationSeconds: 15,
      recommendedAspectRatios: ['2:3'],
      requiredAspectRatios: null,
      maxImages: 1,
      maxVideos: 1,
    },
  },
  mastodon: {
    key: 'mastodon',
    label: 'Mastodon',
    color: '#6364ff',
    textLimit: 500,
    supportsFirstComment: false,
    supportsThreads: true,
    supportsReels: false,
    supportsReshare: true,
    reshareTypes: ['boost', 'quote'],
    supportsHashtagSearch: true,
    supportsUrlVariable: true,
    urlVariableName: 'mastodon_url',
    oauthScopes: ['read', 'write', 'follow'],
    meEndpoint: '/api/v1/accounts/verify_credentials',
    mediaRequirements: {
      maxFileSizeMb: 40,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: commonImage,
      maxVideoDurationSeconds: 120,
      recommendedAspectRatios: [],
      requiredAspectRatios: null,
      maxImages: 4,
      maxVideos: 1,
    },
  },
  bluesky: {
    key: 'bluesky',
    label: 'Bluesky',
    color: '#0085ff',
    textLimit: 300,
    supportsFirstComment: false,
    supportsThreads: true,
    supportsReels: false,
    supportsReshare: true,
    reshareTypes: ['repost', 'quote'],
    supportsHashtagSearch: false,
    supportsUrlVariable: true,
    urlVariableName: 'bluesky_url',
    oauthScopes: [],
    meEndpoint: 'https://bsky.social/xrpc/com.atproto.server.getSession',
    mediaRequirements: {
      maxFileSizeMb: 50,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: commonImage,
      maxVideoDurationSeconds: 60,
      recommendedAspectRatios: [],
      requiredAspectRatios: null,
      maxImages: 4,
      maxVideos: 1,
    },
  },
  tumblr: {
    key: 'tumblr',
    label: 'Tumblr',
    color: '#36465d',
    textLimit: 4096,
    supportsFirstComment: false,
    supportsThreads: false,
    supportsReels: false,
    supportsReshare: true,
    reshareTypes: ['reblog'],
    supportsHashtagSearch: true,
    supportsUrlVariable: true,
    urlVariableName: 'tumblr_url',
    oauthScopes: ['write', 'read'],
    meEndpoint: 'https://api.tumblr.com/v2/user/info',
    mediaRequirements: {
      maxFileSizeMb: 100,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: commonImage,
      maxVideoDurationSeconds: 300,
      recommendedAspectRatios: [],
      requiredAspectRatios: null,
      maxImages: 10,
      maxVideos: 1,
    },
  },
  reddit: {
    key: 'reddit',
    label: 'Reddit',
    color: '#ff4500',
    textLimit: 40000,
    supportsFirstComment: false,
    supportsThreads: false,
    supportsReels: false,
    supportsReshare: true,
    reshareTypes: ['crosspost'],
    supportsHashtagSearch: false,
    supportsUrlVariable: true,
    urlVariableName: 'reddit_url',
    oauthScopes: ['identity', 'submit', 'read', 'mysubreddits'],
    meEndpoint: 'https://oauth.reddit.com/api/v1/me',
    mediaRequirements: {
      maxFileSizeMb: 1024,
      acceptedVideoFormats: commonVideo,
      acceptedImageFormats: commonImage,
      maxVideoDurationSeconds: 900,
      recommendedAspectRatios: [],
      requiredAspectRatios: null,
      maxImages: 20,
      maxVideos: 1,
    },
  },
}

export const PLATFORM_LIST: PlatformConfig[] = PLATFORM_KEYS.map((k) => PLATFORMS[k])

export type ConnectionMode = 'oauth' | 'bluesky' | 'mastodon'

export function connectionModeFor(key: PlatformKey): ConnectionMode {
  if (key === 'bluesky') return 'bluesky'
  if (key === 'mastodon') return 'mastodon'
  return 'oauth'
}
