// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Service Worker
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'whale-watcher-v6';
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
    // Force immediate activation
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
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
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
                    console.error('Fetch failed:', error);
                });
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            // Claim clients immediately
            self.clients.claim(),
            // Clean up old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            //console.log('Service Worker: Clearing Old Cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});
