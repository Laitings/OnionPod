export const catalog = [
  { title: '99% Invisible', author: 'Roman Mars', category: 'Design', categoryId: 1402, color: 'amber', mark: '99%', url: 'https://feeds.simplecast.com/BqbsxVfO',
    artwork: 'https://image.simplecastcdn.com/images/8436e3c1-2479-4466-ac48-fa58259960bb/a6d5b177-ab5d-430d-b3f2-b393a09d8101/3000x3000/sxm-cover-99percentinvisible-r2025-3000x3000-final.jpg' },
  { title: 'Planet Money', author: 'NPR', category: 'Business', categoryId: 1321, color: 'mint', mark: '$', url: 'https://feeds.npr.org/510289/podcast.xml',
    artwork: 'https://media.npr.org/assets/img/2022/10/24/pm_new_tile_2022_sq-e543deddd0a46a98be481b46e6a72efa6b52236f.jpg?s=1400&c=66&f=jpg' },
  { title: 'The Moth', author: 'The Moth', category: 'Personal Journals', categoryId: 1302, color: 'lilac', mark: '✳', url: 'https://rss.amperwave.net/v2/feed/audacynetwork/the-moth',
    artwork: 'https://images.castfire.com/image/661/0/0/0/0-8486082.jpg' },
  { title: 'Radiolab', author: 'WNYC Studios', category: 'Science', categoryId: 1533, color: 'coral', mark: '◉', url: 'https://feeds.simplecast.com/EmVW7VGp',
    artwork: 'https://image.simplecastcdn.com/images/2c9187d6-9dff-4257-bc55-469cf13afd48/60a2cfed-b8ca-460b-abb8-8ab0afb3fa8c/3000x3000/radiolab-showsquare-3000x3000.jpg' },
  { title: 'Genstart', author: 'DR', category: 'News', categoryId: 1489, color: 'lilac', mark: 'G', url: 'https://api.dr.dk/podcasts/v1/feeds/genstart.xml?format=podcast',
    artwork: 'https://api.dr.dk/podcasts/v1/images/urn:dr:podcast:image:67e13b366273e8fc7077613e.jpg' },
  { title: 'The Rest Is History', author: 'Goalhanger', category: 'History', categoryId: 1487, color: 'amber', mark: 'H', url: 'https://feeds.megaphone.fm/GLT4787413333',
    artwork: 'https://megaphone-images.spotifycdn.com/podcasts/00c0a118-2426-11ee-b258-73d331d0123b/image/fc1621e5c07895ac8ebabab7c8e2e40d.jpg?ixlib=rails-4.3.1&max-w=3000&max-h=3000&fit=crop&auto=format,compress' },
  { title: 'Hard Fork', author: 'The New York Times', category: 'Technology', categoryId: 1318, color: 'mint', mark: 'HF', url: 'https://feeds.simplecast.com/6HKOhNgS',
    artwork: 'https://image.simplecastcdn.com/images/4105a47a-42e5-4ccc-887a-832af7989986/23965394-f5e4-4fdb-b150-639f4910353e/3000x3000/nyt-hf-album-art-3000-2.jpg?aid=rss_feed' },
  { title: 'Conan O’Brien Needs a Friend', author: 'Team Coco & Earwolf', category: 'Comedy', categoryId: 1303, color: 'coral', mark: 'C', url: 'https://feeds.simplecast.com/dHoohVNH',
    artwork: 'https://image.simplecastcdn.com/images/8436e3c1-2479-4466-ac48-fa58259960bb/371e5714-91ee-4e31-9ef3-cdd31ebfb9f5/3000x3000/conanobrienneedsafriend-keyart-sxm-3000x3000.jpg?aid=rss_feed' },
  { title: 'Ologies with Alie Ward', author: 'Alie Ward', category: 'Science', categoryId: 1533, color: 'mint', mark: 'O', url: 'https://feeds.simplecast.com/FO6kxYGj',
    artwork: 'https://image.simplecastcdn.com/images/89060b63-e603-4297-b6e8-5a654e50244e/f9713c33-7eca-4512-8d96-7a668e274cb2/3000x3000/image.jpg?aid=rss_feed' },
  { title: 'Criminal', author: 'Phoebe Judge', category: 'True Crime', categoryId: 1488, color: 'lilac', mark: 'C', url: 'https://feeds.megaphone.fm/VMP7924981569',
    artwork: 'https://megaphone-images.spotifycdn.com/podcasts/f547b046-5de4-11ec-acc5-733706bb297f/image/9ed2d59bc3ab179245d05a3c10636f99.png?max-w=600&max-h=600&fit=crop&auto=format,compress' },
  { title: 'Gastropod', author: 'Cynthia Graber & Nicola Twilley', category: 'Food', categoryId: 1306, color: 'amber', mark: 'G', url: 'https://feeds.megaphone.fm/VMP6255701211',
    artwork: 'https://megaphone-images.spotifycdn.com/podcasts/97d6d85e-e320-11eb-be6b-3ff4d7cb8782/image/3af290d77dd48789f45dcd5a93483cd1.png?ixlib=rails-4.3.1&max-w=3000&max-h=3000&fit=crop&auto=format,compress' },
  { title: 'The Daily', author: 'The New York Times', category: 'News', categoryId: 1489, color: 'coral', mark: 'D', url: 'https://feeds.simplecast.com/Sl5CSM3S',
    artwork: 'https://image.simplecastcdn.com/images/7f2f4c05-9c2f-4deb-82b7-b538062bc22d/73549bf1-94b3-40ff-8aeb-b4054848ec1b/3000x3000/the-daily-album-art-original.jpg?aid=rss_feed' }
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

export function podcastCategory(show) {
  const featured = catalog.find(item => item.url === show.url);
  const title = (show.categoryId ? show.category : featured?.category ?? show.category)?.trim();
  if (!title) return null;
  const id = Number(show.categoryId ?? featured?.categoryId);
  if (Number.isInteger(id) && id >= 1300 && id < 2000) {
    return categories.find(category => category.id === id) ?? { id, title };
  }
  return categories.find(category => category.title.toLowerCase() === title.toLowerCase()) ?? null;
}

export function directoryShows(results) {
  const seen = new Set();
  return results.flatMap(item => {
    const url = httpsUrl(item.feedUrl);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const primary = Array.isArray(item.genres) ? item.genres.indexOf(item.primaryGenreName) : -1;
    const categoryId = primary >= 0 && Array.isArray(item.genreIds) ? Number(item.genreIds[primary]) : undefined;
    return [{ url, title: item.collectionName || 'Untitled podcast', author: item.artistName,
      category: item.primaryGenreName, categoryId }];
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

function* descriptionFields(parent, names) {
  for (const name of names) {
    for (const node of parent.children) {
      if (node.localName !== name) continue;
      const markup = node.children.length ? node.innerHTML : node.textContent;
      if (markup?.trim()) yield markup;
    }
  }
}

function firstDescription(fields) {
  for (const markup of fields) {
    const description = descriptionText(markup);
    if (description) return description;
  }
  return '';
}

function* playableEntries(channel, base) {
  const seen = new Set();
  for (const item of channel.children) {
    if (!['entry', 'item'].includes(item.localName)) continue;
    const enclosure = Array.from(item.children).find(child => {
      const type = child.getAttribute('type') ?? '';
      return (child.localName === 'enclosure' || child.localName === 'link' && child.getAttribute('rel') === 'enclosure')
        && (!type || type.startsWith('audio/') || type === 'application/octet-stream');
    });
    const audio = httpsUrl(enclosure?.getAttribute('url') || enclosure?.getAttribute('href'), base);
    if (!audio) continue;
    const id = text(item, 'guid') || text(item, 'id') || audio;
    if (seen.has(id)) continue;
    seen.add(id);
    yield { id, item, audio };
  }
}

export function readEpisodeIds(xml, base, DOM = globalThis.DOMParser) {
  return Array.from(playableEntries(readChannel(xml, DOM), base), ({ id }) => id);
}

export function episodeActivity(previous, ids, opened = false) {
  const known = new Set(previous?.known);
  let unread = opened ? 0 : previous?.unread ?? 0;
  for (const id of ids) {
    if (known.has(id)) continue;
    known.add(id);
    if (previous && !opened) unread++;
  }
  if (previous && known.size === previous.known.length && unread === previous.unread) return previous;
  return { known: [...known], unread };
}

export function parseFeed(xml, base, original, DOM = globalThis.DOMParser) {
  const channel = readChannel(xml, DOM);
  const title = text(channel, 'title') || 'Untitled podcast';
  const artwork = channelArtwork(channel, base);
  const episodeNotes = new Map();
  const episodes = Array.from(playableEntries(channel, base), ({ id, item, audio }) => {
    const key = JSON.stringify([original, id]);
    const fields = [...descriptionFields(item, ['encoded', 'description', 'summary', 'content', 'subtitle'])];
    if (fields.length) episodeNotes.set(key, fields);
    return {
      key, id, audio, title: text(item, 'title') || 'Untitled episode',
      feed: original, show: title, artwork,
      date: text(item, 'pubDate') || text(item, 'published') || text(item, 'updated')
    };
  });
  return {
    url: original, title, artwork, description: firstDescription(descriptionFields(channel, ['description', 'summary', 'subtitle'])),
    author: text(channel, 'author') || text(channel, 'creator'), episodes,
    notesFor(key) {
      const fields = episodeNotes.get(key);
      if (typeof fields === 'string') return fields;
      if (!fields) return '';
      const notes = firstDescription(fields);
      episodeNotes.set(key, notes);
      return notes;
    }
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
