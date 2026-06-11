// v3: добавлен isCacheable-guard и трим /assets/ — bump версии разово вычищает
// кэши прежних версий (включая возможно отравленные) у живых клиентов.
const CACHE = '1trex-sim-v3';
const CORE = ['/', '/index.html', '/offline.html', '/favicon.svg', '/manifest.webmanifest'];
// Хэшированные ассеты копятся между деплоями в одной версии кэша — храним
// ограниченный хвост, старые вычищаются по FIFO (порядок вставки Cache API).
const MAX_ASSET_ENTRIES = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/offline.html'));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

// Кэшировать можно только успешный ответ, и для не-навигаций — только не-HTML:
// hosting переписывает отсутствующие пути в index.html (200 text/html), и без
// этой проверки fallback-HTML кэшировался бы под URL скрипта/стиля, перманентно
// ломая загрузку модулей у клиента (лечится только ручной очисткой кэша).
function isCacheable(request, response) {
  if (!response || !response.ok) return false;
  if (request.mode === 'navigate') return true;
  const type = response.headers.get('content-type') ?? '';
  return !type.includes('text/html');
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (isCacheable(request, response)) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? cache.match(fallbackUrl);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then(async (response) => {
      if (isCacheable(request, response)) {
        await cache.put(request, response.clone());
        await trimAssets(cache);
      }
      return response;
    })
    .catch(() => cached);
  return cached ?? fresh;
}

async function trimAssets(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((req) => new URL(req.url).pathname.startsWith('/assets/'));
  const excess = assets.length - MAX_ASSET_ENTRIES;
  for (let i = 0; i < excess; i += 1) await cache.delete(assets[i]);
}
