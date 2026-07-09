const CACHE_NAME = 'alabanza-v4'; // Subimos versión para forzar actualización

// Generamos la lista de pads automáticamente
const PADS = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'].map(t => `./pads/${t}.mp3`);

const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './index-style.css',
  './admin.html',
  './config.js',
  './index-app.js',
  './logo.png',
  './icono.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
  ...PADS // Agregamos los pads a la lista de descarga inicial
];

// Instalación: Descarga todo (incluyendo pads) al disco duro
self.addEventListener('install', event => {
  self.skipWaiting(); // Fuerza a que el nuevo SW tome el control de inmediato
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Descargando pads y archivos para uso offline...');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activación y limpieza de caches viejas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ESTRATEGIA: Cache First (Priorizar disco local para velocidad instantánea)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Si está en caché, lo devuelve al instante. Si no, lo busca en internet.
      return response || fetch(event.request);
    })
  );
});