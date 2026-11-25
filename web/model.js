export const catalog = [
  { title: '99% Invisible', author: 'Roman Mars', category: 'DESIGN', color: 'amber', mark: '99%', url: 'https://feeds.simplecast.com/BqbsxVfO' },
  { title: 'Planet Money', author: 'NPR', category: 'ECONOMICS', color: 'mint', mark: '$', url: 'https://feeds.npr.org/510289/podcast.xml' },
  { title: 'The Moth', author: 'The Moth', category: 'STORIES', color: 'lilac', mark: '✳', url: 'https://rss.amperwave.net/v2/feed/audacynetwork/the-moth' },
  { title: 'Radiolab', author: 'WNYC Studios', category: 'SCIENCE', color: 'coral', mark: '◉', url: 'https://feeds.simplecast.com/EmVW7VGp' }
];

export function httpsUrl(value, base) {
  if (!value?.trim()) return '';
  try {
    const url = new URL(value.trim(), base);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port) return url.href;
  } catch { /* Invalid URL. */ }
  return '';
}

const direct = (node, name) => Array.from(node.children).find(child => child.localName === name);
const text = (node, name) => direct(node, name)?.textContent.trim() ?? '';

export function parseFeed(xml, base, original, DOM = globalThis.DOMParser) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('This feed uses an unsupported XML declaration.');
  const document = new DOM().parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  const channel = root.localName === 'rss' ? direct(root, 'channel') : root.localName === 'feed' ? root : null;
  if (!channel || document.getElementsByTagName('parsererror').length) throw new Error('This address did not return a valid RSS or Atom feed.');
  const title = text(channel, 'title') || 'Untitled podcast';
  const image = Array.from(channel.children).find(child => child.localName === 'image' && child.hasAttribute('href'));
  const artwork = httpsUrl(image?.getAttribute('href') || direct(channel, 'image')?.querySelector('url')?.textContent || text(channel, 'logo'), base);
  const seen = new Set();
  const episodes = [];
  for (const item of channel.children) {
    if (!['entry', 'item'].includes(item.localName)) continue;
    const enclosure = Array.from(item.children).find(child => {
      const type = child.getAttribute('type') ?? '';
      return (child.localName === 'enclosure' || child.localName === 'link' && child.getAttribute('rel') === 'enclosure')
        && (!type || type.startsWith('audio/') || type === 'application/octet-stream');
    });
    const audio = httpsUrl(enclosure?.getAttribute('url') || enclosure?.getAttribute('href'), base);
    if (!audio) continue;
    const key = JSON.stringify([original, text(item, 'guid') || text(item, 'id') || audio]);
    if (seen.has(key)) continue;
    seen.add(key);
    episodes.push({
      key, audio, title: text(item, 'title') || 'Untitled episode', feed: original, show: title, artwork,
      date: text(item, 'pubDate') || text(item, 'published') || text(item, 'updated')
    });
  }
  return { url: original, title, artwork, author: text(channel, 'author') || text(channel, 'creator'), episodes };
}

export function enqueue(queue, episode) {
  return queue.some(item => item.key === episode.key) ? queue : [...queue, episode];
}

export function time(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const mins = Math.floor(value / 60);
  const tail = String(value % 60).padStart(2, '0');
  return mins < 60 ? mins + ':' + tail : Math.floor(mins / 60) + ':' + String(mins % 60).padStart(2, '0') + ':' + tail;
}
