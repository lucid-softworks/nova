import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import globalsCss from '../styles/globals.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'SocialHub' },
      { name: 'theme-color', content: '#6366f1' },
    ],
    links: [
      { rel: 'stylesheet', href: globalsCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

// Runs before React hydrates — applies the persisted theme so we don't
// flash a light screen at users who chose dark. Kept deliberately tiny.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`

// Registers the PWA service worker once the page has settled. No-op when
// the feature isn't available (SSR, older browsers, http dev contexts).
const SW_REGISTER_SCRIPT = `
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function(){});
  });
}
`

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
      </body>
    </html>
  )
}
