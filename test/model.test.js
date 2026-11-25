import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, httpsUrl, time } from '../web/model.js';
import { feedAddress, publicAddress, serve } from '../server.mjs';

test('queue preserves order and ignores duplicate episode keys', () => {
  const first = { key: 'one' };
  const second = { key: 'two' };
  const queue = enqueue([first], second);
  assert.deepEqual(queue, [first, second]);
  assert.equal(enqueue(queue, { key: 'one', title: 'Updated' }), queue);
});

test('feed asset URLs only allow HTTPS without credentials', () => {
  assert.equal(httpsUrl('../audio.mp3', 'https://example.com/shows/feed'), 'https://example.com/audio.mp3');
  assert.equal(httpsUrl('javascript:alert(1)'), '');
  assert.equal(httpsUrl('https://name:pw@example.com/'), '');
  assert.equal(time(3670.9), '1:01:10');
});

test('feed relay rejects local, special-use and non-HTTPS destinations', () => {
  for (const address of ['127.179.0.1', '169.254.169.254', '10.0.0.1', '192.168.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1', '2002::1']) {
    assert.equal(publicAddress(address), false, address);
  }
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700::1'), true);
  for (const url of ['https://127.0.0.1/', 'http://example.com/', 'https://example.com:8443/', 'https://[::1]/']) {
    assert.throws(() => feedAddress(url), /public HTTPS/);
  }
});

test('server exposes shared assets and rejects a local feed before fetching', async () => {
  const server = serve();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const home = await fetch(base);
    assert.match(await home.text(), /<title>OnionPod<\/title>/);
    assert.equal((await fetch(base + '/server.mjs')).status, 404);
    assert.equal((await fetch(base + '/api/feed?url=https://127.0.0.1')).status, 502);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
