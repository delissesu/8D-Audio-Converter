// web/sw.js
// Service Worker for offline PWA support and caching static assets.

const CACHE_NAME = '8d-audio-studio-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/css/tokens.css',
  '/css/components/preset-picker.css',
  '/css/components/preview-toggle.css',
  '/css/components/history-panel.css',
  '/css/components/file-queue.css',
  '/css/components/waveform-editor.css',
  '/js/app.js',
  '/js/core/Component.js',
  '/js/core/EventBus.js',
  '/js/services/AudioConverter.js',
  '/js/services/BrowserDSP.js',
  '/js/services/HistoryManager.js',
  '/js/services/PresetManager.js',
  '/js/services/RealtimePreview.js',
  '/js/components/FileQueueComponent.js',
  '/js/components/HistoryPanelComponent.js',
  '/js/components/PresetPickerComponent.js',
  '/js/components/PreviewToggleComponent.js',
  '/js/components/WaveformEditorComponent.js',
  '/js/worklets/8d_processor.worklet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests to our own origin
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip API calls and dynamic endpoints
  if (event.request.url.includes('/api/') || event.request.url.includes('/convert') || event.request.url.includes('/status') || event.request.url.match(/\/s\/[a-zA-Z0-9_-]+/)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Cache new static requests opportunistically
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback: if asking for an HTML page or root, serve index.html
      if (event.request.mode === 'navigate' || event.request.headers.get('accept').includes('text/html')) {
        return caches.match('/index.html');
      }
    })
  );
});
