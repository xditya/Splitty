// Minimal offline shell. Cache-first for the app shell and hashed assets;
// network passthrough for /api and cross-origin. Every respondWith() path
// must settle — a rejected handler surfaces as NS_ERROR_INTERCEPTION_FAILED
// and breaks loads harder than having no service worker at all.
const CACHE = 'splitty-shell-v2'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

async function assetResponse(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const res = await fetch(request)
    if (res.ok) {
      const copy = res.clone()
      const cache = await caches.open(CACHE)
      await cache.put(request, copy)
    }
    return res
  } catch {
    // network died mid-flight and nothing cached: settle with a proper
    // network-error response instead of rejecting the handler
    return Response.error()
  }
}

async function navigationResponse(request) {
  try {
    return await fetch(request)
  } catch {
    const cached = await caches.match('/')
    return cached ?? Response.error()
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(assetResponse(e.request))
  } else if (e.request.mode === 'navigate') {
    e.respondWith(navigationResponse(e.request))
  }
})
