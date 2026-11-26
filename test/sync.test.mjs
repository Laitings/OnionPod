import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { serve } from '../server.mjs';
import { SyncStore, validateExchange } from '../sync-store.mjs';

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
    const follow = { type: 'follow', key: feed,
      value: { title: 'A following', category: 'Daily News', categoryId: 1526 }, at: now };
    const details = { key: episode, feed, title: 'First episode', show: 'A following',
      audio: 'https://example.com/episode.mp3', artwork: '', date: '' };
    const played = { type: 'progress', key: episode, value: 185, at: now, episode: details };
    const send = await server.post('exchange', { cursor: 0, changes: [follow, played] }, phone);
    assert.equal(send.status, 200);
    const pull = await (await server.post('exchange', { cursor: 0, changes: [] }, web)).json();
    assert.deepEqual(pull.changes.map(item => item.value), [
      { url: feed, title: 'A following', author: '', artwork: '', category: 'Daily News', categoryId: 1526 }, 185
    ]);
    assert.deepEqual(pull.changes.find(item => item.type === 'progress').episode, details);

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
    assert.deepEqual(persisted.changes.find(item => item.type === 'progress').episode, details);
    assert.equal((await server.post('logout', {}, phone)).status, 200);
    assert.equal((await server.post('exchange', { cursor: 0, changes: [] }, phone)).status, 401);
    assert.equal((await server.get('/api/sync/session', web)).status, 200);
  } finally {
    await server.close();
    store.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('the newest queue wins and invalid queues are rejected', () => {
  const store = new SyncStore(':memory:');
  try {
    const item = { key: episode, feed, audio: 'https://example.com/episode.mp3', title: 'First', show: 'Show', artwork: '', date: '' };
    const now = Date.now();
    const queue = { type: 'queue', key: 'queue', value: [item], at: now };
    store.exchange(0, validateExchange({ cursor: 0, changes: [queue] }).changes);
    const older = { ...queue, value: [], at: now - 1000 };
    assert.deepEqual(store.exchange(0, validateExchange({ cursor: 0, changes: [older] }).changes).accepted, [queue]);
    assert.throws(() => validateExchange({ cursor: 0, changes: [{ ...queue, value: [{ ...item, audio: 'nope' }] }] }));
    assert.throws(() => validateExchange({ cursor: 0, changes: [{ ...queue, value: Array(101).fill(item) }] }));
  } finally { store.close(); }
});

test('removing from Continue Listening is accepted and shared', () => {
  const store = new SyncStore(':memory:');
  try {
    const change = { type: 'dismiss', key: episode, value: true, at: Date.now() };
    const batch = validateExchange({ cursor: 0, changes: [change] });
    assert.deepEqual(batch.changes, [change]);
    store.exchange(0, batch.changes);
    assert.deepEqual(store.exchange(0, []).changes, [change]);
    assert.throws(() => validateExchange({ cursor: 0, changes: [{ ...change, value: false }] }));
  } finally { store.close(); }
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

test('existing progress survives migration and resume metadata survives older client updates', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'onionpod-sync-upgrade-'));
  const position = { type: 'progress', key: episode, value: 57, at: 10 };
  let store = new SyncStore(folder);
  try {
    store.exchange(0, [position]);
    store.close();
    store = null;
    const legacy = new DatabaseSync(join(folder, 'onionpod.sqlite3'));
    try { legacy.exec('ALTER TABLE sync_state DROP COLUMN episode'); }
    finally { legacy.close(); }
    store = new SyncStore(folder);
    assert.deepEqual(store.exchange(0, []).changes, [position]);

    const metadata = { key: episode, title: 'First episode', show: 'Test show', feed, audio: 'https://example.com/1.mp3' };
    store.exchange(0, [{ ...position, episode: metadata }], true);
    store.exchange(0, [{ ...position, value: 18, at: 20 }], true);
    const [latest] = store.exchange(0, []).changes;
    assert.equal(latest.value, 18);
    assert.deepEqual(latest.episode, metadata);
  } finally {
    store?.close();
    await rm(folder, { recursive: true, force: true });
  }
});
