// Minimal offline-shell service worker (root scope covers all areas).
// Network-first, cache fallback. Skips /api/* so data is never stale-served.
const CACHE = "jaqyn-web-v3";
const SHELL = ["/", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) return;

  // Page navigations: network-only, with the offline shell as fallback. Never
  // cache-serve a document — doing so could return the wrong page for a URL.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  // Static assets: network-first, cache fallback (skip opaque/redirected responses).
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request)),
  );
});
