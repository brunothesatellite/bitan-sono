/* ==========================================================================
   bitan·sono mobile — service worker
   --------------------------------------------------------------------------
   Réseau d'abord (l'application pilote du matériel : mieux vaut une version
   fraîche), repli sur le cache quand le téléphone est hors ligne. Le shell est
   pré-mis en cache à l'installation pour que la page s'ouvre sans réseau.
   ========================================================================== */

const CACHE = "bitan-sono-mobile-v1";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./analysis.js",
  "./alarm.js",
  "./device.js",
  "./i18n.js",
  "./protocol.js",
  "./transports.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/ws") || request.headers.has("range")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || caches.match("./index.html").then((page) => page || Response.error()))
      )
  );
});
