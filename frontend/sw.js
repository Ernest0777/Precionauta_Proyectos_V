/*
  Service worker de Precionauta: hace la página instalable y le da un respaldo
  sin conexión. Siempre intenta la red primero (así nunca sirve archivos viejos
  mientras el equipo desarrolla) y solo usa la copia guardada si no hay red.
  Las ofertas (API en otro origen) y las fotos de Mercado Libre no se tocan.
*/
const CACHE = "precionauta-v1";
const SHELL = ["./", "./index.html", "./css/tokens.css", "./css/base.css", "./css/layout.css", "./css/components.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
