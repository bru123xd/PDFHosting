/* Service worker de la biblioteca.
   - El armazón (html, manifiesto, PDF.js) se guarda al instalar.
   - Los volúmenes NO se guardan solos: pesan demasiado. Se guardan
     cuando tocas "Guardar sin conexión" dentro del lector, y desde
     aquí se sirven desde la caché cuando existan. */

const SHELL = "shell-v1";
const PDFS  = "volumenes-v1";

const ARMAZON = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // Uno por uno: si un recurso externo falla, no tumba la instalación.
    await Promise.all(ARMAZON.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => n !== SHELL && n !== PDFS).map(n => caches.delete(n)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Volúmenes: primero la caché, y si no está, la red tal cual.
  if (url.pathname.endsWith(".pdf")) {
    e.respondWith((async () => {
      const guardado = await caches.match(req, { cacheName: PDFS, ignoreVary: true });
      return guardado || fetch(req);
    })());
    return;
  }

  // Resto: se responde desde caché y se refresca por detrás.
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const guardado = await cache.match(req, { ignoreSearch: true });
    const red = fetch(req).then(res => {
      if (res && res.ok && (url.origin === location.origin || res.type === "cors")) {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    }).catch(() => null);

    if (guardado) return guardado;
    const res = await red;
    if (res) return res;
    // Sin conexión y sin copia: si pedían una página, devolvemos la portada.
    if (req.mode === "navigate") {
      const inicio = await cache.match("./index.html");
      if (inicio) return inicio;
    }
    return new Response("Sin conexión", { status: 503, statusText: "Sin conexión" });
  })());
});
