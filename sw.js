const CACHE_NAME = 'alabanza-v37';

// Generamos la lista de pads automáticamente
const PADS = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'].map(t => `./pads/${t}.mp3`);

const urlsToCache = [
  './',
  './index.html',
  './app-mobile-theme.css',
  './app-mobile-theme.js',
  './app-mobile-shell.css',
  './app-mobile-shell.js',
  './offline-lyrics.css',
  './offline-lyrics.js',
  './offline-audio.js',
  './offline-audio-ui.js',
  './offline-audio-ui.css',
  './style.css',
  './ux.css',
  './reader.css',
  './rehearsal-mixer.css',
  './audio-engine.js',
  './rehearsal-mixer.js',
  './rehearsal-cloud-config.js',
  './drummer-reader.js',
  './reader-experience.js',
  './permissions.js',
  './admin-ux.css',
  './app.js',
  './rhythm.js',
  './services.js',
  './index-style.css',
  './admin.html',
  './config.js',
  './index-app.js',
  './logo.png',
  './icono-192.png',
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
  ...PADS // Agregamos los pads a la lista de descarga inicial
];

// Keep the interface installable even if an optional audio/CDN download fails.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const esenciales = urlsToCache.filter(url => url.startsWith('./') && !PADS.includes(url));
    await cache.addAll(esenciales);
    await Promise.allSettled(urlsToCache.filter(url => !esenciales.includes(url)).map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(nombre => nombre.startsWith('alabanza-') && nombre !== CACHE_NAME).map(nombre => caches.delete(nombre)));
    await self.clients.claim();
  })());
});

// Refresh HTML, scripts and styles online; use saved files when offline.
// Audio and external assets retain their fast cache-first behavior.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Private audio is always authenticated and never stored in the PWA cache.
  if (request.headers?.has('Authorization') || url.port === '8765' || url.hostname.endsWith('.supabase.co')) return;
  const interfaz = url.origin === self.location.origin && (
    request.mode === 'navigate' || /\.(?:html|js|css)$/.test(url.pathname)
  );
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const buscarGuardado = async () => {
      const exacto = await cache.match(request);
      if (exacto) return exacto;
      // Song deep links share the same offline document.
      if (request.mode === 'navigate') return cache.match(url.pathname.endsWith('admin.html') ? './admin.html' : './index.html');
    };
    if (interfaz) {
      try {
        const respuesta = await fetch(request, { cache: 'no-cache' });
        if (respuesta.ok) {
          await cache.put(request, respuesta.clone());
          return respuesta;
        }
        return (await buscarGuardado()) || respuesta;
      } catch (error) {
        const guardado = await buscarGuardado();
        if (guardado) return guardado;
        throw error;
      }
    }
    const guardado = await cache.match(request);
    if (guardado) return guardado;
    const respuesta = await fetch(request);
    if (respuesta.ok && (url.origin === self.location.origin || ['www.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname))) {
      await cache.put(request, respuesta.clone());
    }
    return respuesta;
  })());
});
