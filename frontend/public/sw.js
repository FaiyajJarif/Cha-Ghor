/*
 * Cha Ghor service worker (hand-rolled, no build-time dependency).
 * Strategies:
 *   - navigations        -> network-first, fall back to cached app shell (offline SPA boot)
 *   - /api/ GET requests -> network-first, fall back to last cached response (offline reads)
 *   - JS / CSS           -> network-first, fall back to cache (see below)
 *   - images, fonts, tiles -> stale-while-revalidate (staleness is harmless)
 * Writes (POST/PUT/PATCH/DELETE) are NOT intercepted here; the app-layer outbox
 * (src/lib/outbox.js) queues them in IndexedDB and replays when back online.
 *
 * WHY CODE IS NO LONGER STALE-WHILE-REVALIDATE
 *   It used to be, and it shipped a real bug: staleWhileRevalidate returns
 *   `cached || network`, so the OLD script ran and the new one was only stored
 *   for next time. Every change therefore needed two reloads to appear, and
 *   because VERSION was a hardcoded constant that never changed, the activate
 *   handler -- which deletes caches NOT starting with VERSION -- never deleted
 *   anything. Entries could survive indefinitely.
 *
 *   The visible symptom was one browser behaving differently from another on
 *   the same machine: Safari kept serving a bundle from before a change (no
 *   live socket, buttons wired to old handlers) while Brave, whose cache had
 *   been cleared, was correct. That is not a browser difference, it is this
 *   file.
 *
 *   Code is now network-first: if the network answers, that is what runs. The
 *   cache is a genuine offline fallback rather than the default source of
 *   truth. Assets whose staleness cannot break behaviour keep the fast path.
 *
 * BUMP VERSION WHEN YOU CHANGE THIS FILE. It is the only thing that evicts old
 * caches, and a stale cache is invisible until it wastes an afternoon.
 */
const VERSION = "chaghor-v2";
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

// `jsonFallback` controls what happens when the network is gone AND nothing is
// cached. For /api/ that should be a readable JSON error the app can show. For
// a SCRIPT it must not be: handing a JSON body back to a <script> tag produces
// a syntax error that hides the real cause, which is simply being offline.
async function networkFirst(request, cacheName, jsonFallback = true) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (!jsonFallback) return Response.error();
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

// Vite's dev server serves modules from these paths and does its own hot
// reloading. Caching them at all fights the dev server and is the fastest way
// to spend an hour debugging a change that was already correct.
function isDevAsset(url) {
  return (
    url.pathname.startsWith("/@vite") ||
    url.pathname.startsWith("/@react-refresh") ||
    url.pathname.startsWith("/@fs") ||
    url.pathname.startsWith("/@id") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/src/")
  );
}

// Anything that can change how the app BEHAVES. Getting a stale copy of one of
// these is not a slightly old picture, it is old logic.
function isCode(request, url) {
  return (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "worker" ||
    /\.(js|mjs|jsx|ts|tsx|css)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // writes handled by app-layer outbox

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never touch a WebSocket handshake or a dev-server request.
  if (url.protocol === "ws:" || url.protocol === "wss:") return;
  if (isDevAsset(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNav(request));
    return;
  }
  if (url.pathname.includes("/api/")) {
    event.respondWith(networkFirst(request, API));
    return;
  }
  // Code: network wins when it is reachable, cache is the offline fallback.
  if (isCode(request, url)) {
    event.respondWith(networkFirst(request, STATIC, false));
    return;
  }
  // Images, fonts, map tiles: stale is fine and the speed is worth it.
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
