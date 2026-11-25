export const catalog = [
  { title: '99% Invisible', author: 'Roman Mars', category: 'DESIGN', color: 'amber', mark: '99%', url: 'https://feeds.simplecast.com/BqbsxVfO',
    artwork: 'https://image.simplecastcdn.com/images/8436e3c1-2479-4466-ac48-fa58259960bb/a6d5b177-ab5d-430d-b3f2-b393a09d8101/3000x3000/sxm-cover-99percentinvisible-r2025-3000x3000-final.jpg' },
  { title: 'Planet Money', author: 'NPR', category: 'ECONOMICS', color: 'mint', mark: '$', url: 'https://feeds.npr.org/510289/podcast.xml',
    artwork: 'https://media.npr.org/assets/img/2022/10/24/pm_new_tile_2022_sq-e543deddd0a46a98be481b46e6a72efa6b52236f.jpg?s=1400&c=66&f=jpg' },
  { title: 'The Moth', author: 'The Moth', category: 'STORIES', color: 'lilac', mark: '✳', url: 'https://rss.amperwave.net/v2/feed/audacynetwork/the-moth',
    artwork: 'https://images.castfire.com/image/661/0/0/0/0-8486082.jpg' },
  { title: 'Radiolab', author: 'WNYC Studios', category: 'SCIENCE', color: 'coral', mark: '◉', url: 'https://feeds.simplecast.com/EmVW7VGp',
    artwork: 'https://image.simplecastcdn.com/images/2c9187d6-9dff-4257-bc55-469cf13afd48/60a2cfed-b8ca-460b-abb8-8ab0afb3fa8c/3000x3000/radiolab-showsquare-3000x3000.jpg' }
];

export const categories = [
  { id: 1301, title: 'Arts', mark: '✿' },
  { id: 1321, title: 'Business', mark: '↗' },
  { id: 1303, title: 'Comedy', mark: '☺' },
  { id: 1304, title: 'Education', mark: '▤' },
  { id: 1483, title: 'Fiction', mark: '✧' },
  { id: 1487, title: 'History', mark: '◷' },
  { id: 1489, title: 'News', mark: '▥' },
  { id: 1533, title: 'Science', mark: '⊙' },
  { id: 1324, title: 'Society & Culture', mark: '◎' },
  { id: 1545, title: 'Sports', mark: '◉' },
  { id: 1318, title: 'Technology', mark: '⌘' },
  { id: 1488, title: 'True Crime', mark: '⌕' }
];

export function directoryShows(results) {
  const seen = new Set();
  return results.flatMap(item => {
    const url = httpsUrl(item.feedUrl);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ url, title: item.collectionName || 'Untitled podcast', author: item.artistName, category: item.primaryGenreName }];
  });
}

export function chartIds(chart) {
  const entries = chart.feed?.entry ?? [];
  if (!Array.isArray(entries)) return [];
  return [...new Set(entries.map(item => item?.id?.attributes?.['im:id'])
    .filter(id => typeof id === 'string' && /^[0-9]{1,16}$/.test(id)))].slice(0, 25);
}

export function rankedShows(ids, results) {
  const byId = new Map(results.map(item => [String(item.collectionId ?? item.trackId), item]));
  return directoryShows(ids.map(id => byId.get(id)).filter(Boolean));
}

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

function readChannel(xml, DOM) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('This feed uses an unsupported XML declaration.');
  const document = new DOM().parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  const channel = root.localName === 'rss' ? direct(root, 'channel') : root.localName === 'feed' ? root : null;
  if (!channel || document.getElementsByTagName('parsererror').length) throw new Error('This address did not return a valid RSS or Atom feed.');
  return channel;
}

function channelArtwork(channel, base) {
  const images = Array.from(channel.children).filter(child => child.localName === 'image');
  const candidates = [
    ...images.map(image => image.getAttribute('href')),
    ...images.map(image => text(image, 'url')),
    text(channel, 'logo'), text(channel, 'icon')
  ];
  return candidates.map(value => httpsUrl(value, base)).find(Boolean) ?? '';
}

export function readArtwork(xml, base, DOM = globalThis.DOMParser) {
  return channelArtwork(readChannel(xml, DOM), base);
}

function descriptionText(markup) {
  // A template keeps feed markup inert. Only extracted text reaches the app UI.
  const template = globalThis.document.createElement('template');
  template.innerHTML = markup;
  for (const node of template.content.querySelectorAll('script, style, iframe, object, noscript')) node.remove();
  for (const node of template.content.querySelectorAll('p, div, li, blockquote, h1, h2, h3, br')) {
    node.after('\n');
  }
  return template.content.textContent
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function showDescription(channel) {
  for (const name of ['description', 'summary', 'subtitle']) {
    for (const node of channel.children) {
      if (node.localName !== name) continue;
      const value = node.children.length ? node.innerHTML : node.textContent;
      const description = descriptionText(value);
      if (description) return description;
    }
  }
  return '';
}

export function parseFeed(xml, base, original, DOM = globalThis.DOMParser) {
  const channel = readChannel(xml, DOM);
  const title = text(channel, 'title') || 'Untitled podcast';
  const artwork = channelArtwork(channel, base);
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
  return {
    url: original, title, artwork, description: showDescription(channel),
    author: text(channel, 'author') || text(channel, 'creator'), episodes
  };
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
