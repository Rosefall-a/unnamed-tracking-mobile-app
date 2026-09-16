const CACHE = "tracking-shell-v1";
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/offline.html", "/manifest.webmanifest", "/pwa-icon.svg"]))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) return;
  event.respondWith(fetch(event.request).catch(() => event.request.mode === "navigate" ? caches.match("/offline.html") : caches.match(event.request)));
});
