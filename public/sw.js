/* Nova service worker — minimal stale-while-revalidate for static
 * assets + an offline fallback. Bump CACHE_VERSION to invalidate. */
const CACHE_VERSION = 'v1'
const STATIC_CACHE = `sh-static-${CACHE_VERSION}`
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, '/manifest.webmanifest', '/icons/icon.svg']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith('sh-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Never cache API, auth, webhook, or server-fn calls.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_serverFn')) {
    if (req.mode === 'navigate') event.respondWith(networkOrOffline(req))
    return
  }

  // Static assets: stale-while-revalidate.
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(staleWhileRevalidate(req))
    return
  }

  // Navigations: network-first, fall back to offline shell.
  if (req.mode === 'navigate') {
    event.respondWith(networkOrOffline(req))
  }
})

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((res) => {
      if (res && res.status === 200) cache.put(request, res.clone())
      return res
    })
    .catch(() => null)
  return cached ?? (await network) ?? new Response('', { status: 504 })
}

async function networkOrOffline(request) {
  try {
    return await fetch(request)
  } catch {
    const cache = await caches.open(STATIC_CACHE)
    const fallback = await cache.match(OFFLINE_URL)
    return fallback ?? new Response('Offline', { status: 503 })
  }
}
