import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import globalsCss from '../styles/globals.css?url'
import { I18nProvider, parseAcceptLanguage, type Locale } from '~/lib/i18n'
import { RouteErrorBoundary } from '~/components/RouteErrorBoundary'
import { Toaster } from '~/components/ui/toast'
import { ConfirmProvider } from '~/components/ui/confirm'

const detectLocale = createServerFn({ method: 'GET' }).handler(async (): Promise<Locale> => {
  try {
    const header = getRequest().headers.get('accept-language')
    return parseAcceptLanguage(header)
  } catch {
    return 'en'
  }
})

export const Route = createRootRoute({
  loader: async () => {
    const locale = await detectLocale()
    return { locale }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Nova — social media management' },
      {
        name: 'description',
        content:
          'Plan, publish, and measure every post across X, Bluesky, Mastodon, LinkedIn, Instagram, Threads, YouTube Shorts, Facebook, Pinterest and more — from one place.',
      },
      { name: 'theme-color', content: '#6366f1' },
      // Open Graph — individual routes override title/description as needed.
      { property: 'og:site_name', content: 'Nova' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'Nova — social media management' },
      {
        property: 'og:description',
        content:
          'Plan, publish, and measure every post across every platform from one place. BYOK AI, real calendar, team approvals, analytics.',
      },
      { property: 'og:image', content: 'https://skeduleit.org/og-image.svg' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:url', content: 'https://skeduleit.org/' },
      // Twitter — falls back to OG tags when absent, but explicit wins.
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Nova — social media management' },
      {
        name: 'twitter:description',
        content:
          'Plan, publish, and measure every post across every platform from one place. BYOK AI, real calendar, team approvals, analytics.',
      },
      { name: 'twitter:image', content: 'https://skeduleit.org/og-image.svg' },
    ],
    links: [
      { rel: 'stylesheet', href: globalsCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
  }),
  component: RootComponent,
  errorComponent: RouteErrorBoundary,
})

function RootComponent() {
  const { locale } = Route.useLoaderData()
  return (
    <I18nProvider locale={locale}>
      <ConfirmProvider>
        <RootDocument locale={locale}>
          <Outlet />
          <Toaster />
        </RootDocument>
      </ConfirmProvider>
    </I18nProvider>
  )
}

const DARK_MODE_SCRIPT = `
try {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
    document.documentElement.classList.toggle('dark', e.matches);
  });
} catch (e) {}
`

const SW_REGISTER_SCRIPT = `
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function(){});
  });
}
`

function RootDocument({ locale, children }: { locale: string; children: ReactNode }) {
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: DARK_MODE_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
      </body>
    </html>
  )
}
