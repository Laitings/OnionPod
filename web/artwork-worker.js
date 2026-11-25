const CACHE = 'onionpod-artwork-v1';
const LIMIT = 40;
let writes = Promise.resolve();

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function changeCache(action) {
  writes = writes.then(async () => action(await caches.open(CACHE))).catch(() => {});
  return writes;
}

function isRemoteHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin !== self.location.origin;
  } catch { return false; }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.destination !== 'image' || !isRemoteHttps(request.url)) return;
  const response = caches.open(CACHE).then(cache => cache.match(request)).catch(() => undefined)
    .then(async cached => {
      if (cached) return { response: cached };
      const result = await fetch(request);
      const copy = result.ok || result.type === 'opaque' ? result.clone() : null;
      return { response: result, copy };
    });
  event.respondWith(response.then(result => result.response));
  event.waitUntil(response.then(({ copy }) => {
    if (!copy) return;
    return changeCache(async cache => {
      await cache.put(request, copy);
      const keys = await cache.keys();
      for (const key of keys.slice(0, Math.max(0, keys.length - LIMIT))) await cache.delete(key);
    });
  }).catch(() => {}));
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'forget-artwork' || !isRemoteHttps(event.data.url)) return;
  event.waitUntil(changeCache(cache => cache.delete(event.data.url)));
});
