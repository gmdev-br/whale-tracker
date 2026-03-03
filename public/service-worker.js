// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Service Worker
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'whale-watcher-v4';
const urlsToCache = [
    '/',
    '/index.html',
    '/css/variables.css',
    '/css/base.css',
    '/css/layout.css',
    '/css/components/buttons.css',
    '/css/components/inputs.css',
    '/css/components/badges.css',
    '/css/components/panels.css',
    '/css/components/tables.css',
    '/css/components/tabs.css',
    '/css/components/chart.css',
    '/css/utilities.css',
    '/css/animations.css',
    '/css/mobile.css',
    '/js/main.js',
    '/js/storage/settings.js',
    '/js/events/init.js',
    '/js/events/handlers.js',
    '/js/charts/config.js',
    '/js/charts/scatter.js',
    '/js/charts/liquidation.js',
    '/js/charts/chart-mechanics-adapted.js',
    '/js/ui/panels.js',
    '/js/ui/table.js',
    '/js/ui/combobox.js',
    '/js/ui/filters.js',
    '/js/ui/status.js',
    '/js/ui/columnWidth.js',
    '/js/state.js',
    '/js/config.js',
    '/js/storage/data.js',
    '/js/api/leaderboard.js',
    '/js/api/exchangeRates.js',
    '/js/api/hyperliquid.js',
    '/js/utils/performance.js',
    '/js/utils/virtualScroll.js',
    '/js/utils/currency.js',
    '/js/utils/formatters.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    // Force the waiting service worker to become the active service worker.
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                //console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
            .catch((error) => {
                console.error('Cache install failed:', error);
            })
    );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    // Only handle HTTP/HTTPS requests
    if (!event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }

                // If it's a favicon or icon that doesn't exist, don't spew errors
                if (event.request.url.includes('favicon.ico') || event.request.url.includes('icon-192.png')) {
                    return fetch(event.request).catch(() => new Response('', { status: 404, statusText: 'Not Found' }));
                }

                // Clone the request
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest).then((response) => {
                    // Check if valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                }).catch((error) => {
                    console.error('Fetch failed for', event.request.url, error);
                    // Ensure we always return a valid Response object to avoid "Failed to convert value to 'Response'" error
                    return new Response('', { status: 408, statusText: 'Network Error' });
                });
            })
            .catch(() => {
                return new Response('', { status: 500, statusText: 'Offline' });
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
