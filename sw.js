// Network-first service worker. Every game file is re-checked with the server on each
// load (so a new version shows up straight away instead of after GitHub Pages' 10-minute
// cache), and the last good copy is kept so the game still opens offline.
// Keep this file simple and stable: browsers only re-check it about once a day.

const CACHE = "dash-keyboard-escape";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      try {
        // "no-cache" = always ask the server if the file changed (cheap 304 when it hasn't).
        const res = await fetch(req.url, { cache: "no-cache", credentials: "same-origin" });
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.url, copy));
        }
        return res;
      } catch (err) {
        const hit = await caches.match(req.url);
        if (hit) return hit;
        throw err;
      }
    })(),
  );
});
