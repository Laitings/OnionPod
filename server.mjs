import { createServer } from 'node:http';
import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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
  ['/site.webmanifest', ['site.webmanifest', 'application/manifest+json']],
  ...[32, 180, 192, 512].map(size => {
    const file = 'icons/onionpod-' + size + '.png';
    return ['/' + file, [file, 'image/png']];
  })
]);
const policy = "default-src 'self'; img-src 'self' https:; media-src https:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
export function serve() {
  let active = 0;
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', policy);
    const json = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return json(405, { error: 'GET required.' });
    let url;
    try { url = new URL('http://localhost' + req.url); }
    catch { return json(400, { error: 'Invalid request URL.' }); }
    if (!req.url.startsWith('/') || url.origin !== 'http://localhost') return json(400, { error: 'Invalid request URL.' });
    if (url.pathname === '/api/feed' || url.pathname === '/api/search') {
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Open OnionPod to use this API.' });
      if (active >= 12) return json(503, { error: 'Please try again in a moment.' });
      active++;
      try {
        const term = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
        const target = url.pathname === '/api/feed'
          ? feedAddress(url.searchParams.get('url'))
          : new URL('https://itunes.apple.com/search?' + new URLSearchParams({ term, media: 'podcast', limit: '18' }));
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
      res.writeHead(200, { 'Content-Type': asset[1] });
      res.end(body);
    } catch { json(500, { error: 'Application file unavailable.' }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? '4173');
  serve().listen(port, host, () => console.log('OnionPod listening on http://' + host + ':' + port));
}
