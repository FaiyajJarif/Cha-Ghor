/*
 * Cha Ghor service worker (hand-rolled, no build-time dependency).
 * Strategies:
 *   - navigations        -> network-first, fall back to cached app shell (offline SPA boot)
 *   - /api/ GET requests -> network-first, fall back to last cached response (offline reads)
 *   - static assets      -> stale-while-revalidate (fast loads, silent updates)
 * Writes (POST/PUT/PATCH/DELETE) are NOT intercepted here; the app-layer outbox
 * (src/lib/outbox.js) queues them in IndexedDB and replays when back online.
 */
const VERSION = "chaghor-v1";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const API = `${VERSION}-api`;

const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ offline: true, error: "You are offline and no cached copy is available." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function networkFirstNav(request) {
  const cache = await caches.open(SHELL);
  try {
    const fresh = await fetch(request);
    return fresh;
  } catch (err) {
    return (await cache.match("/index.html")) || (await cache.match("/")) ||
      new Response("<h1>Offline</h1>", { status: 503, headers: { "Content-Type": "text/html" } });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // writes handled by app-layer outbox
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNav(request));
    return;
  }
  if (url.pathname.includes("/api/")) {
    event.respondWith(networkFirst(request, API));
    return;
  }
  // same-origin assets + cross-origin (map tiles, fonts): stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, STATIC));
});

// Background Sync: the SW can't read the auth token (it lives in the page), so
// on a sync event we ask every open client to flush its IndexedDB outbox.
self.addEventListener("sync", (event) => {
  if (event.tag === "chaghor-outbox") {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach((c) => c.postMessage({ type: "chaghor-flush-outbox" }));
      })()
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "chaghor-skip-waiting") self.skipWaiting();
});
