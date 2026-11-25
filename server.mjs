import { createServer } from 'node:http';
import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SyncStore, sessionCookie, validateExchange } from './sync-store.mjs';

const reserved = new BlockList();
for (const [ip, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3]
]) reserved.addSubnet(ip, bits);
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [ip, bits] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) {
  reserved.addSubnet(ip, bits, 'ipv6');
}
export function publicAddress(ip) {
  if (isIP(ip) === 4) return !reserved.check(ip);
  return isIP(ip) === 6 && globalV6.check(ip, 'ipv6') && !reserved.check(ip, 'ipv6');
}

export function feedAddress(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      url.hostname.startsWith('[') || isIP(url.hostname) || !url.hostname.includes('.')) {
    throw new Error('Use a public HTTPS feed URL.');
  }
  return url;
}

async function fetchText(url, signal, redirects = 0) {
  if (redirects > 4 || signal.aborted) throw new Error('The request timed out or redirected too many times.');
  const addresses = await lookup(url.hostname, { all: true });
  const address = addresses.find(entry => publicAddress(entry.address));
  if (!address || addresses.some(entry => !publicAddress(entry.address))) throw new Error('The feed host must be public.');
  const response = await new Promise((resolve, reject) => {
    const req = request(url, {
      signal, agent: false, family: address.family,
      lookup: (_name, _options, done) => done(null, address.address, address.family),
      headers: { 'User-Agent': 'OnionPod/0.1', Accept: 'application/rss+xml, application/json, text/xml, */*' }
    }, resolve);
    req.on('error', reject);
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
    response.destroy();
    return fetchText(feedAddress(new URL(response.headers.location, url)), signal, redirects + 1);
  }
  if (response.statusCode !== 200) {
    response.destroy();
    throw new Error('The source returned HTTP ' + response.statusCode + '.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of response) {
    size += chunk.length;
    if (size > 10_000_000) throw new Error('The source response is too large.');
    chunks.push(chunk);
  }
  return { url: url.href, body: Buffer.concat(chunks).toString('utf8') };
}

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ['/sync.js', ['sync.js', 'text/javascript; charset=utf-8']],
  ['/artwork-worker.js', ['artwork-worker.js', 'text/javascript; charset=utf-8']],
  ['/site.webmanifest', ['site.webmanifest', 'application/manifest+json']],
  ...[32, 180, 192, 512].map(size => {
    const file = 'icons/onionpod-' + size + '.png';
    return ['/' + file, [file, 'image/png']];
  })
]);
const policy = "default-src 'self'; img-src 'self' https:; media-src https:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const artworkWorkerPolicy = "default-src 'none'; connect-src https:";

async function readJson(req, limit) {
  const type = req.headers['content-type']?.split(';')[0].toLowerCase();
  if (type !== 'application/json') throw new Error('JSON required.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      req.resume();
      throw new Error('Request is too large.');
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function rateWindow(limit, duration) {
  let until = 0;
  let used = 0;
  return () => {
    if (Date.now() >= until) { until = Date.now() + duration; used = 0; }
    if (used >= limit) return false;
    used++;
    return true;
  };
}

export function serve({ syncStore, publicOrigin, allowGuestRelay = !syncStore } = {}) {
  let active = 0;
  let activeLogins = 0;
  const allowLogin = rateWindow(10, 60_000);
  const allowRelay = rateWindow(180, 60_000);
  const allowSync = rateWindow(240, 60_000);
  const secureCookie = publicOrigin?.startsWith('https:');
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000, connectionsCheckingInterval: 2000 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const json = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    let url;
    try { url = new URL('http://localhost' + req.url); }
    catch { return json(400, { error: 'Invalid request URL.' }); }
    if (!req.url.startsWith('/') || url.origin !== 'http://localhost') return json(400, { error: 'Invalid request URL.' });
    res.setHeader('Content-Security-Policy', url.pathname === '/artwork-worker.js' ? artworkWorkerPolicy : policy);
    const fromAndroid = req.headers['x-onionpod-client'] === 'android' && !req.headers.origin && !req.headers['sec-fetch-site'];
    const token = fromAndroid
      ? (req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1] ?? '')
      : (req.headers.cookie?.match(/(?:^|;\s*)onionpod_session=([A-Za-z0-9_-]+)/)?.[1] ?? '');
    const signedIn = Boolean(syncStore?.authorized(token));
    if (url.pathname.startsWith('/api/') && req.headers['sec-fetch-site'] === 'cross-site') {
      return json(403, { error: 'Open OnionPod to use this API.' });
    }
    if (url.pathname.startsWith('/api/sync/')) {
      const action = url.pathname.slice('/api/sync/'.length);
      if (action === 'session' && req.method === 'GET') {
        return json(200, { enabled: Boolean(syncStore?.isReady()), signedIn, relayRequiresLogin: !allowGuestRelay });
      }
      if (req.method !== 'POST') return json(405, { error: 'POST required.' });
      if (!fromAndroid && (!publicOrigin || req.headers.origin !== publicOrigin)) {
        return json(403, { error: 'Open the configured OnionPod address to use sync.' });
      }
      if (!syncStore?.isReady()) return json(503, { error: 'Sync is waiting for a server account to be set up.' });
      if (action === 'login') {
        if (activeLogins >= 2 || !allowLogin()) return json(429, { error: 'Too many sign-in attempts. Try again in a minute.' });
        activeLogins++;
        try {
          let credential;
          try { credential = (await readJson(req, 4096))?.password; }
          catch { return json(400, { error: 'Invalid sign-in request.' }); }
          const session = await syncStore.signIn(credential);
          if (!session) return json(401, { error: 'Incorrect sync password.' });
          if (fromAndroid) return json(200, { signedIn: true, token: session });
          res.setHeader('Set-Cookie', sessionCookie(session, secureCookie));
          return json(200, { signedIn: true });
        } catch {
          return json(500, { error: 'Could not start the session.' });
        } finally { activeLogins--; }
      }
      if (!signedIn) return json(401, { error: 'Sign in to sync your library.' });
      if (action === 'logout') {
        syncStore.signOut(token);
        if (!fromAndroid) res.setHeader('Set-Cookie', sessionCookie('', secureCookie));
        return json(200, { signedIn: false });
      }
      if (action === 'exchange') {
        if (!allowSync()) return json(429, { error: 'Sync is busy. Try again in a moment.' });
        let batch;
        try { batch = validateExchange(await readJson(req, 1_000_000)); }
        catch { return json(400, { error: 'Invalid sync data. Make sure the device clock is correct.' }); }
        if (!syncStore.authorized(token)) return json(401, { error: 'Sign in to sync your library.' });
        try { return json(200, syncStore.exchange(batch.cursor, batch.changes, batch.pushOnly)); }
        catch { return json(500, { error: 'Sync storage is temporarily unavailable.' }); }
      }
      return json(404, { error: 'Sync action not found.' });
    }
    if (req.method !== 'GET') return json(405, { error: 'GET required.' });
    if (url.pathname === '/api/feed' || url.pathname === '/api/search') {
      if (!allowGuestRelay && !signedIn) return json(401, { error: 'Sign in to search or open a podcast feed.' });
      if (!allowRelay()) return json(429, { error: 'Too many feed requests. Try again in a moment.' });
      if (active >= 12) return json(503, { error: 'Please try again in a moment.' });
      active++;
      try {
        const term = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
        const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '18', 10) || 18));
        const target = url.pathname === '/api/feed'
          ? feedAddress(url.searchParams.get('url'))
          : new URL('https://itunes.apple.com/search?' + new URLSearchParams({ term, media: 'podcast', limit: String(limit) }));
        const data = await fetchText(target, AbortSignal.timeout(12000));
        return json(200, data);
      } catch (error) {
        return json(502, { error: error.message });
      } finally { active--; }
    }
    const asset = assets.get(url.pathname);
    if (!asset) return json(404, { error: 'Page not found.' });
    try {
      const body = await readFile(new URL('./web/' + asset[0], import.meta.url));
      if (url.pathname === '/artwork-worker.js') res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200, { 'Content-Type': asset[1] });
      res.end(body);
    } catch { json(500, { error: 'Application file unavailable.' }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? '4173');
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(host);
  const directory = process.env.DATA_DIR;
  const configuredOrigin = process.env.PUBLIC_ORIGIN || (loopback ? 'http://127.0.0.1:' + port : '');
  if (directory && !configuredOrigin) throw new Error('Set PUBLIC_ORIGIN to the HTTPS origin of your OnionPod site.');
  const origin = directory ? new URL(configuredOrigin) : null;
  if (origin && (origin.origin !== configuredOrigin ||
      !(origin.protocol === 'https:' || origin.protocol === 'http:' && loopback && origin.hostname === '127.0.0.1'))) {
    throw new Error('PUBLIC_ORIGIN must use HTTPS or loopback HTTP for local development.');
  }
  process.umask(0o077);
  const syncStore = directory ? new SyncStore(directory) : undefined;
  serve({ syncStore, publicOrigin: origin?.origin, allowGuestRelay: !directory && loopback })
    .listen(port, host, () => console.log('OnionPod listening on http://' + host + ':' + port));
}
