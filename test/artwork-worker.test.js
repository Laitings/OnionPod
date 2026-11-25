import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

test('artwork worker reuses saved covers when offline and leaves other requests alone', async () => {
  const listeners = {};
  const stored = new Map();
  const cache = {
    match: async request => stored.get(request.url),
    put: async (request, response) => { stored.set(request.url, response); },
    keys: async () => [...stored.keys()].map(url => ({ url })),
    delete: async key => stored.delete(key.url ?? key)
  };
  const cover = { type: 'opaque', clone: () => cover };
  let networkCalls = 0;
  const source = await readFile(new URL('../web/artwork-worker.js', import.meta.url), 'utf8');
  runInNewContext(source, {
    URL,
    self: { location: { origin: 'https://onionpod.test' }, addEventListener: (name, handler) => { listeners[name] = handler; } },
    caches: { open: async () => cache },
    fetch: async () => {
      if (++networkCalls > 1) throw new Error('Offline');
      return cover;
    }
  });
  async function request(url, destination) {
    let response;
    let saved;
    listeners.fetch({
      request: { method: 'GET', destination, url },
      respondWith: promise => { response = promise; },
      waitUntil: promise => { saved = promise; }
    });
    await saved;
    return response;
  }
  const image = 'https://publisher.test/cover.jpg';
  assert.equal(await request(image, 'image'), cover);
  assert.equal(await request(image, 'image'), cover);
  assert.equal(await request('https://publisher.test/episode.mp3', 'audio'), undefined);
  assert.equal(networkCalls, 1);
});
