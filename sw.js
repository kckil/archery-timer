const APP_ROOT = new URL('./', self.location.href);
const CACHE_PREFIX = `archery-timer:${APP_ROOT.pathname}:`;
// Bump this version whenever a precached file changes.
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const ASSET_URLS = [
    'index.html',
    'style.css',
    'script.js',
    'offline.js',
    'manifest.webmanifest',
    'audio/silence.wav',
    'icons/icon-180.png',
    'icons/icon-192.png',
    'icons/icon-512.png'
].map(path => new URL(path, APP_ROOT).href);

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(
            ASSET_URLS.map(url => new Request(url, { cache: 'reload' }))
        ))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(names => Promise.all(
            names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                .map(name => caches.delete(name))
        ))
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== APP_ROOT.origin) return;

    const isAppPage = event.request.mode === 'navigate'
        && (url.pathname === APP_ROOT.pathname || url.pathname === `${APP_ROOT.pathname}index.html`);
    url.search = '';
    if (!isAppPage && !ASSET_URLS.includes(url.href)) return;

    const cacheURL = isAppPage ? new URL('index.html', APP_ROOT).href : url.href;
    event.respondWith(
        caches.open(CACHE_NAME).then(async cache => {
            const cached = await cache.match(cacheURL);
            return cached || fetch(event.request);
        })
    );
});
