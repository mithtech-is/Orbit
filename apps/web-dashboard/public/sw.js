/* Orbit dashboard service worker — shell caching for installable PWA. */
const CACHE = "orbit-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/logo.svg", "/logo-256.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache API calls — always go to network so data is never stale.
  if (url.pathname.startsWith("/api/")) return;
  // Navigations: network-first, fall back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }
  // Static assets: cache-first.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
