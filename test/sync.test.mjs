import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { serve } from '../server.mjs';
import { SyncStore } from '../sync-store.mjs';

const origin = 'https://onionpod.example.test';
const password = 'test-only password for integration';
const feed = 'https://example.com/podcast.xml';
const episode = JSON.stringify([feed, 'episode-1']);
const browser = { Origin: origin, 'Content-Type': 'application/json' };
const android = { 'X-OnionPod-Client': 'android', 'Content-Type': 'application/json' };

async function start(store) {
  const server = serve({ syncStore: store, publicOrigin: origin });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    get: (path, headers = {}) => fetch('http://127.0.0.1:' + server.address().port + path, { headers }),
    post: (action, body, headers = {}) => fetch('http://127.0.0.1:' + server.address().port + '/api/sync/' + action,
      { method: 'POST', headers, body: JSON.stringify(body) }),
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

test('web and Android sync share durable state, with protected routes and revoked sessions', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'onionpod-sync-'));
  let store = new SyncStore(folder);
  await store.setPassword(password);
  let server = await start(store);
  try {
    assert.equal((await server.get('/api/search?q=planet+money')).status, 401);
    assert.equal((await server.get('/api/feed?url=https://example.com/feed')).status, 401);
    assert.equal((await server.post('exchange', { cursor: 0, changes: [] }, browser)).status, 401);

    const webLogin = await server.post('login', { password }, browser);
    assert.equal(webLogin.status, 200);
    assert.deepEqual(await webLogin.json(), { signedIn: true });
    const cookie = webLogin.headers.get('set-cookie');
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict']) assert.match(cookie, new RegExp(flag));
    const web = { ...browser, Cookie: cookie.split(';')[0] };
    assert.equal((await server.get('/api/feed?url=https://127.0.0.1/', web)).status, 502);
    assert.equal((await server.post('exchange', { cursor: 0, changes: [] }, { ...web, Origin: 'https://different.test' })).status, 403);
    assert.equal((await server.post('exchange', { cursor: 0, changes: [] }, { 'Content-Type': 'application/json', Cookie: web.Cookie })).status, 403);
    assert.equal((await server.post('login', { password: 'incorrect' }, android)).status, 401);
    const androidLogin = await server.post('login', { password }, android);
    assert.equal(androidLogin.status, 200);
    const { token } = await androidLogin.json();
    assert.match(token, /^[\w-]{43}$/);
    const phone = { ...android, Authorization: 'Bearer ' + token };

    const now = Date.now() - 5000;
    const follow = { type: 'follow', key: feed, value: { title: 'A following' }, at: now };
    const played = { type: 'progress', key: episode, value: 185, at: now };
    const send = await server.post('exchange', { cursor: 0, changes: [follow, played] }, phone);
    assert.equal(send.status, 200);
    const pull = await (await server.post('exchange', { cursor: 0, changes: [] }, web)).json();
    assert.deepEqual(pull.changes.map(item => item.value), [
      { url: feed, title: 'A following', author: '', artwork: '' }, 185
    ]);

    const rewind = { ...played, value: 25, at: now + 200 };
    const unfollow = { ...follow, value: null, at: now + 200 };
    await server.post('exchange', { cursor: pull.cursor, changes: [rewind, unfollow] }, web);
    const nativeUpload = await (await server.post('exchange', {
      cursor: 0, pushOnly: true, changes: [{ ...played, value: 27, at: now + 300 }]
    }, phone)).json();
    assert.deepEqual(nativeUpload, { accepted: [{ ...played, value: 27, at: now + 300 }] });
    const offline = await (await server.post('exchange', {
      cursor: pull.cursor, changes: [{ ...played, value: 205, at: now + 100 }, follow]
    }, phone)).json();
    assert.deepEqual(offline.accepted.map(item => item.value), [27, null]);

    await server.close();
    store.close();
    store = new SyncStore(folder);
    server = await start(store);
    const persisted = await (await server.post('exchange', { cursor: 0, changes: [] }, phone)).json();
    assert.deepEqual(persisted.changes.map(item => item.value), [null, 27]);
    assert.equal((await server.post('logout', {}, phone)).status, 200);
    assert.equal((await server.post('exchange', { cursor: 0, changes: [] }, phone)).status, 401);
    assert.equal((await server.get('/api/sync/session', web)).status, 200);
  } finally {
    await server.close();
    store.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('existing device libraries merge without overriding newer actions', async () => {
  const store = new SyncStore(':memory:');
  try {
    const legacy = { type: 'progress', key: episode, value: 40, at: 0 };
    store.exchange(0, [legacy]);
    assert.equal(store.exchange(0, [{ ...legacy, value: 90 }]).accepted[0].value, 90);
    store.exchange(0, [{ ...legacy, value: 0, at: Date.now() }]);
    assert.equal(store.exchange(0, [legacy]).accepted[0].value, 0);
    store.exchange(0, [{ type: 'follow', key: feed, value: null, at: Date.now() }]);
    const imported = store.exchange(0, [{ type: 'follow', key: feed, value: { title: 'Old subscription' }, at: 0 }]);
    assert.equal(imported.accepted[0].value, null);
  } finally { store.close(); }
});
