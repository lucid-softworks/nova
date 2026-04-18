import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { getPublicBioPage, type PublicBioPage } from '~/server/bioPage'
import { useT } from '~/lib/i18n'
import { cn } from '~/lib/utils'

export const Route = createFileRoute('/bio/$handle')({
  loader: async ({ params }) => {
    return getPublicBioPage({ data: { handle: params.handle } })
  },
  head: ({ loaderData }) => {
    const page = loaderData as PublicBioPage | null
    if (!page) return { meta: [{ title: 'Not found' }] }
    const title = page.displayName ?? `@${page.handle}`
    const description =
      page.bio?.trim() || `Links and recent posts from ${page.displayName ?? page.handle}.`
    const url = `https://skeduleit.org/bio/${page.handle}`
    // Avatar if set; otherwise fall back to the site OG image. Most socials
    // want raster but SVG works on Slack/Discord/Twitter — good enough until
    // we swap to a proper avatar-backed PNG card.
    const image = page.avatarUrl ?? 'https://skeduleit.org/og-image.svg'
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'profile' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { property: 'og:image', content: image },
        { property: 'profile:username', content: page.handle },
        { name: 'twitter:card', content: page.avatarUrl ? 'summary' : 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
      ],
      links: [{ rel: 'canonical', href: url }],
    }
  },
  component: BioPageRoute,
})

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  threads: 'Threads',
  x: 'X',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
  tumblr: 'Tumblr',
  reddit: 'Reddit',
}

function BioPageRoute() {
  const t = useT()
  const page = Route.useLoaderData() as PublicBioPage | null

  if (!page) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-[#0b0d12]">
        <p className="text-neutral-500 dark:text-neutral-400">{t('bio.pageNotFound')}</p>
      </div>
    )
  }

  const isDark = page.theme === 'dark'
  const isMinimal = page.theme === 'minimal'

  return (
    <div
      className={cn(
        'flex min-h-screen flex-col items-center px-4 py-12',
        isDark && 'bg-[#0b0d12] text-neutral-100',
        isMinimal && 'bg-white text-neutral-900 dark:bg-white dark:text-neutral-900',
        !isDark && !isMinimal && 'bg-indigo-50 text-neutral-900 dark:bg-indigo-950 dark:text-neutral-100',
      )}
    >
      <div className="w-full max-w-md space-y-6">
        {/* Avatar */}
        {page.avatarUrl ? (
          <div className="flex justify-center">
            <img
              src={page.avatarUrl}
              alt={page.displayName ?? page.handle}
              className="h-24 w-24 rounded-full object-cover"
            />
          </div>
        ) : null}

        {/* Name & bio */}
        <div className="text-center">
          <h1 className="text-2xl font-bold">{page.displayName ?? page.handle}</h1>
          {page.bio ? (
            <p
              className={cn(
                'mt-2 text-sm',
                isDark && 'text-neutral-400',
                isMinimal && 'text-neutral-500',
                !isDark && !isMinimal && 'text-neutral-600 dark:text-neutral-300',
              )}
            >
              {page.bio}
            </p>
          ) : null}
        </div>

        {/* Links */}
        {page.links.length > 0 ? (
          <div className="space-y-3">
            {page.links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                  isDark &&
                    'border border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700',
                  isMinimal &&
                    'border border-neutral-200 bg-neutral-50 text-neutral-900 hover:bg-neutral-100',
                  !isDark &&
                    !isMinimal &&
                    'border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50',
                )}
              >
                <ExternalLink className="h-4 w-4" />
                {link.title}
              </a>
            ))}
          </div>
        ) : null}

        {/* Recent posts */}
        {page.showRecentPosts && page.recentPosts.length > 0 ? (
          <div className="space-y-4">
            <h2
              className={cn(
                'text-center text-sm font-semibold uppercase tracking-wide',
                isDark && 'text-neutral-500',
                isMinimal && 'text-neutral-400',
                !isDark && !isMinimal && 'text-indigo-500 dark:text-indigo-400',
              )}
            >
              {t('bio.recentPosts')}
            </h2>
            <div className="space-y-3">
              {page.recentPosts.map((post) => (
                <div
                  key={post.id}
                  className={cn(
                    'rounded-lg p-4 text-sm',
                    isDark && 'bg-neutral-800/60 border border-neutral-700',
                    isMinimal && 'bg-neutral-50 border border-neutral-200',
                    !isDark &&
                      !isMinimal &&
                      'bg-white/80 border border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800',
                  )}
                >
                  <p className="whitespace-pre-wrap line-clamp-4">{post.content}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
                    {post.publishedAt ? (
                      <time dateTime={post.publishedAt}>
                        {new Date(post.publishedAt).toLocaleDateString()}
                      </time>
                    ) : null}
                    {post.platforms.length > 0 ? (
                      <span className="flex gap-1">
                        {post.platforms.map((p) => (
                          <span
                            key={p}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-medium',
                              isDark && 'bg-neutral-700 text-neutral-300',
                              isMinimal && 'bg-neutral-200 text-neutral-600',
                              !isDark &&
                                !isMinimal &&
                                'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
                            )}
                          >
                            {PLATFORM_LABELS[p] ?? p}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
