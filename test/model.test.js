import test from 'node:test';
import assert from 'node:assert/strict';
import { chartIds, directoryShows, enqueue, episodeActivity, episodeInboxUpdate, estimateReleasePattern, httpsUrl, inboxNewestFirst, parseFeed, podcastCategory, rankedShows, readFeedEpisodes, recentProgress, resumeEpisode, time } from '../web/model.js';
import { feedAddress, publicAddress, serve } from '../server.mjs';

test('Continue Listening chooses the latest unfinished episode across local and synced progress', () => {
  const feed = 'https://example.com/episodes.xml';
  const key = id => JSON.stringify([feed, id]);
  const details = { key: key('current'), feed, audio: 'https://example.com/current.mp3', title: 'Example' };
  assert.equal(resumeEpisode(details).title, 'Example');
  assert.equal(resumeEpisode({ ...details, audio: 'https://example.com/' + 'a'.repeat(2048) }), null);
  assert.equal(resumeEpisode({ ...details, feed: 'https://example.com/other.xml' }), null);
  const progress = { [key('older')]: 120, [key('done')]: 0, [key('current')]: 20, [key('offline')]: 35 };
  const remote = { [key('older')]: 50, [key('done')]: 100, [key('current')]: 80 };
  assert.deepEqual(recentProgress(progress, remote, key('older'), { [key('offline')]: 90 }).map(item => item.key),
    [key('offline'), key('current'), key('older')]);
});

test('podcast cards retain the primary chart category and support older follows', () => {
  const [show] = directoryShows([{
    feedUrl: 'https://example.com/feed.xml', collectionName: 'The Night Show',
    primaryGenreName: 'Science Fiction', genres: ['Podcasts', 'Science Fiction', 'Fiction'],
    genreIds: ['26', '1485', '1483']
  }]);
  assert.deepEqual(podcastCategory(show), { id: 1485, title: 'Science Fiction' });
  assert.equal(podcastCategory({ category: 'Technology' }).id, 1318);
  assert.deepEqual(podcastCategory({
    url: 'https://feeds.simplecast.com/BqbsxVfO', category: 'DESIGN'
  }), { id: 1402, title: 'Design' });
  assert.equal(podcastCategory({ category: 'Podcasts', categoryId: 26 }), null);
});

test('new episodes accumulate once and stay unread until the show opens', () => {
  const initial = episodeActivity(undefined, ['old', 'older']);
  assert.equal(initial.unread, 0);

  const firstUpdate = episodeActivity(initial, ['new', 'old', 'new']);
  assert.equal(firstUpdate.unread, 1);
  assert.equal(episodeActivity(firstUpdate, ['older', 'old']), firstUpdate);

  const nextUpdate = episodeActivity(firstUpdate, ['newest', 'new', 'old']);
  assert.equal(nextUpdate.unread, 2);
  const opened = episodeActivity(nextUpdate, ['just-published', 'newest', 'new'], true);
  assert.equal(opened.unread, 0);
  assert.equal(episodeActivity(opened, ['just-published', 'older']), opened);
  assert.equal(episodeActivity(opened, ['next-release', 'just-published']).unread, 1);
});

test('the inbox baselines followed feeds and adds each release once even when the show opens', () => {
  const old = { id: 'old' };
  const release = { id: 'release' };
  const initial = episodeInboxUpdate(undefined, [old]);
  assert.deepEqual(initial.added, []);

  const opened = episodeInboxUpdate(initial.activity, [release, old], true);
  assert.equal(opened.activity.unread, 0);
  assert.deepEqual(opened.added, [release]);
  assert.deepEqual(episodeInboxUpdate(opened.activity, [release, old]).added, []);
});

test('the inbox imports previously unread releases once and orders episodes by date', () => {
  const old = { id: 'old', date: '2026-08-10' };
  const release = { id: 'release', date: '2026-08-12' };
  const undated = { id: 'undated', date: '', discoveredAt: Date.parse('2026-08-11') };
  const legacy = { known: ['old', 'release'], unread: 1 };
  const upgraded = episodeInboxUpdate(legacy, [release, old]);
  assert.equal(upgraded.activity.unread, 1);
  assert.deepEqual(upgraded.added, [release]);
  assert.deepEqual(episodeInboxUpdate(upgraded.activity, [release, old]).added, []);
  assert.deepEqual(inboxNewestFirst([old, release, undated]), [release, undated, old]);
});

test('an upcoming date appears before audio is available and future audio stays out of the inbox', () => {
  const node = (localName, textContent = '', children = [], attrs = {}) => ({
    localName, textContent, children, getAttribute: name => attrs[name] ?? null
  });
  const item = (id, date, audio) => node('item', '', [
    node('guid', id), node('title', id), node('pubDate', date),
    ...(audio ? [node('enclosure', '', [], { type: 'audio/mpeg', url: `https://example.com/${id}.mp3` })] : [])
  ]);
  const channel = node('channel', '', [node('title', 'Example show'),
    item('later', 'Fri, 11 Dec 2026 12:00:00 GMT', true),
    item('announcement', 'Wed, 25 Nov 2026 12:00:00 GMT', false),
    item('preview', 'Fri, 27 Nov 2026 12:00:00 GMT', true),
    item('published', 'Fri, 20 Nov 2026 12:00:00 GMT', true)]);
  class FeedDOM {
    parseFromString() { return { documentElement: node('rss', '', [channel]), getElementsByTagName: () => [] }; }
  }
  const feed = 'https://example.com/feed';
  const now = Date.parse('2026-11-24T12:00:00Z');
  const previewTime = Date.parse('2026-11-27T12:00:00Z');
  const show = parseFeed('', feed, feed, FeedDOM, now);
  assert.deepEqual(show.releaseTiming, { kind: 'scheduled', at: Date.parse('2026-11-25T12:00:00Z'), title: 'announcement' });
  assert.deepEqual(show.episodes.map(episode => episode.id), ['published']);
  const initial = episodeInboxUpdate(undefined, readFeedEpisodes('', feed, feed, FeedDOM, previewTime - 1));
  const afterRelease = readFeedEpisodes('', feed, feed, FeedDOM, previewTime);
  assert.deepEqual(episodeInboxUpdate(initial.activity, afterRelease).added.map(episode => episode.id), ['preview']);
  assert.equal(parseFeed('', feed, feed, FeedDOM, previewTime).releaseTiming.title, 'later');
});

test('release estimates need a consistent recent pattern in local calendar dates', () => {
  const dates = days => days.map(day => new Date(2026, 10, day, 12).toISOString());
  const now = new Date(2026, 10, 25, 15).getTime();
  assert.deepEqual(estimateReleasePattern(dates([20, 13, 6, -1, -8]), now),
    { kind: 'estimated', cadence: 'weekly', weekday: 5 });
  assert.deepEqual(estimateReleasePattern(dates([20, 6, -8, -22, -36]), now),
    { kind: 'estimated', cadence: 'fortnightly', weekday: 5 });
  assert.deepEqual(estimateReleasePattern(dates([25, 24, 23, 20, 19, 18, 17]), now),
    { kind: 'estimated', cadence: 'weekdays' });
  assert.deepEqual(estimateReleasePattern(dates([24, 23, 22, 21, 20, 19, 18]), now),
    { kind: 'estimated', cadence: 'daily' });
  assert.equal(estimateReleasePattern(dates([20, 13, 6, -1, -8]), new Date(2026, 10, 28).getTime()), null);
  assert.equal(estimateReleasePattern(dates([20, 13, 7, -1, -8]), now), null);
  assert.equal(estimateReleasePattern([...dates([20, 13, 6, -1, -1]), 'invalid'], now), null);
});

test('category results retain chart order and skip missing or insecure feed URLs', () => {
  const entries = ['4', '2', '7', '3', '2', 'invalid'].map(id => ({ id: { attributes: { 'im:id': id } } }));
  const ids = chartIds({ feed: { entry: entries } });
  assert.deepEqual(ids, ['4', '2', '7', '3']);
  const results = [
    { collectionId: 2, collectionName: 'Second', feedUrl: 'https://example.com/second.xml' },
    { collectionId: 3, collectionName: 'Insecure', feedUrl: 'http://example.com/feed.xml' },
    { collectionId: 4, collectionName: 'First', feedUrl: 'https://example.com/first.xml' }
  ];
  assert.deepEqual(rankedShows(ids, results).map(show => show.title), ['First', 'Second']);
});

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
    assert.match(home.headers.get('content-security-policy'), /connect-src 'self'/);
    const worker = await fetch(base + '/artwork-worker.js?v=2');
    assert.equal(worker.status, 200);
    assert.match(worker.headers.get('content-security-policy'), /connect-src https:/);
    assert.equal(worker.headers.get('cache-control'), 'no-cache');
    assert.equal((await fetch(base + '/server.mjs')).status, 404);
    assert.equal((await fetch(base + '/api/feed?url=https://127.0.0.1')).status, 502);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
