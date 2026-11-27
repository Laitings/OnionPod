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
  { id: 'paranormal-uap', title: 'Paranormal & UAP', mark: '✦', queries: ['UAP UFO', 'paranormal'] },
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

// Words too common in podcast copy to say anything about a show's subject.
const stopWords = new Set(('a about above after again against all also am an and any are around as at back be because been ' +
  'before being best between both but by can come could day did do does doing down during each even every few find first for ' +
  'free from further get gets go going good great had has have having he her here hers him his how i if in into is it its ' +
  'join just know last latest like listen listener listeners listening live make makes many may me more most much must my ' +
  'never new news next no nor not now of off on once one only or other our ours out over own part people really same say ' +
  'she should show shows so some still story stories such take than that the their theirs them then there these they thing ' +
  'things this those through time to today too two under until up us use very want was way we week weekly weeks well were ' +
  'what when where which while who whom why will with world would year years you your yours daily month monthly ' +
  'podcast podcasts episode episodes season host hosts hosted hosting guest guests subscribe subscription follow apple ' +
  'spotify amazon youtube patreon instagram twitter facebook tiktok http https www com org net email visit support ' +
  'sponsor sponsors advertising advertise ads choices privacy policy information megaphone acast audio bonus premium ' +
  'content series talk talks discuss discusses conversation conversations interview interviews bring brings ' +
  'og i jeg det at en et den til er som på de med han av ikke der så var meg seg men ett har om vi min mitt ha hadde hun ' +
  'nå over da ved fra du ut sin dem oss opp man kan hans hvor eller hva skal selv sjøl her alle vil bli ble blitt kunne ' +
  'inn når være kom noen noe ville dere deres kun ja etter ned skulle denne for deg si sine sitt mot å meget hvorfor ' +
  'dette disse uten hvordan ingen din ditt blir samme hvilken hvilke sånn inni mellom vår hver hvem vors hvis både bare ' +
  'enn fordi før mange også slik vært begge siden').split(' '));

// Word and two-word counts from a show's title, description, and recent episode titles.
export function showTerms(show) {
  const terms = new Map();
  const add = (text, weight) => {
    const clean = String(text ?? '').toLowerCase().replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/g, ' . ');
    for (const phrase of clean.split(/[^\p{L}\p{N}'’ -]+/u)) {
      let previous = '';
      for (const raw of phrase.split(/[\s-]+/)) {
        const word = raw.replace(/['’]s$/, '').replace(/^['’]+|['’]+$/g, '');
        if (word.length < 3 && word !== 'ai' || stopWords.has(word) || /^\p{N}+$/u.test(word)) { previous = ''; continue; }
        terms.set(word, (terms.get(word) ?? 0) + weight);
        if (previous) terms.set(previous + ' ' + word, (terms.get(previous + ' ' + word) ?? 0) + weight);
        previous = word;
      }
    }
  };
  add(show.title, 3);
  add(show.description, 3);
  for (const episode of (show.episodes ?? []).slice(0, 30)) add(episode.title, 1);
  return terms;
}

// Search phrases: what several followed shows share, then what sets each one apart.
export function searchKeywords(profiles, limit = 16) {
  const spread = new Map();
  for (const terms of profiles) {
    for (const [term, count] of terms) {
      const entry = spread.get(term) ?? { shows: 0, score: 0 };
      entry.shows++;
      entry.score += Math.min(count, 6) * (term.includes(' ') ? 1.5 : 1);
      spread.set(term, entry);
    }
  }
  const rank = ([, a], [, b]) => b.score * b.shows - a.score * a.shows;
  const shared = [...spread].filter(([, entry]) => entry.shows > 1).sort(rank).slice(0, Math.ceil(limit / 3));
  const picked = new Set(shared.map(([term]) => term));
  const own = profiles.map(terms => [...terms]
    .filter(([, count]) => count > 1)
    .map(([term, count]) => [term, count * (term.includes(' ') ? 1.8 : 1) / spread.get(term).shows ** 2])
    .sort((a, b) => b[1] - a[1]).map(([term]) => term));
  for (let round = 0; round < 6 && picked.size < limit; round++) {
    for (const list of own) {
      if (list[round] && picked.size < limit) picked.add(list[round]);
    }
  }
  return [...picked];
}

// Ranks candidates by TF-IDF similarity to the closest followed show.
export function rankSimilar(follows, candidates, limit = 12) {
  const all = [...follows, ...candidates];
  const documents = new Map();
  for (const { terms } of all) {
    for (const term of terms.keys()) documents.set(term, (documents.get(term) ?? 0) + 1);
  }
  const vector = terms => {
    const weights = new Map();
    let length = 0;
    for (const [term, count] of terms) {
      const weight = (1 + Math.log(count)) * Math.log(all.length / documents.get(term));
      weights.set(term, weight);
      length += weight * weight;
    }
    length = Math.sqrt(length) || 1;
    for (const [term, weight] of weights) weights.set(term, weight / length);
    return weights;
  };
  // Leave out other languages and translated editions of shows already followed.
  const languages = new Set(follows.map(follow => follow.language).filter(Boolean));
  const names = follows.map(follow => follow.show.title.toLowerCase());
  candidates = candidates.filter(({ show, language }) =>
    !(language && languages.size && !languages.has(language)) &&
    !names.some(name => show.title.toLowerCase().includes(name)));
  const sources = follows.map(follow => ({ ...follow, vector: vector(follow.terms) }));
  const scored = candidates.flatMap(candidate => {
    const own = vector(candidate.terms);
    const matches = sources.map(source => {
      const shared = [];
      for (const [term, weight] of own) {
        const other = source.vector.get(term);
        if (other) shared.push([term, weight * other]);
      }
      shared.sort((a, b) => b[1] - a[1]);
      return { source, shared, score: shared.reduce((sum, [, value]) => sum + value, 0) };
    }).sort((a, b) => b.score - a.score);
    const best = matches[0];
    // One shared word is coincidence, such as a common first name.
    if (!best || best.shared.length < 3) return [];
    return [{
      show: candidate.show, because: best.source.show.title,
      words: best.shared.slice(0, 3).map(([term]) => term),
      score: best.score + (matches[1]?.score ?? 0) / 4
    }];
  }).sort((a, b) => b.score - a.score);
  // Keep one followed show from filling the whole row.
  const cap = Math.max(3, Math.ceil(limit / Math.max(1, follows.length)));
  const used = new Map();
  return scored.filter(item => {
    used.set(item.because, (used.get(item.because) ?? 0) + 1);
    return used.get(item.because) <= cap;
  }).slice(0, limit);
}

export function unfollowedShows(shows, follows, limit = 12) {
  const urls = new Set(follows.map(show => show.url));
  const titles = new Set(follows.map(show => show.title?.trim().toLowerCase()));
  return shows.filter(show => !urls.has(show.url) && !titles.has(show.title?.trim().toLowerCase())).slice(0, limit);
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

export function chartIds(chart, limit = 25) {
  const entries = chart.feed?.entry ?? [];
  if (!Array.isArray(entries)) return [];
  return [...new Set(entries.map(item => item?.id?.attributes?.['im:id'])
    .filter(id => typeof id === 'string' && /^[0-9]{1,16}$/.test(id)))].slice(0, limit);
}

export function rankedShows(ids, results) {
  const byId = new Map(results.map(item => [String(item.collectionId ?? item.trackId), item]));
  return directoryShows(ids.map(id => byId.get(id)).filter(Boolean));
}

export function mergeShows(lists, limit = 25) {
  const merged = [];
  const seen = new Set();
  const max = Math.max(0, ...lists.map(list => list.length));
  for (let index = 0; index < max && merged.length < limit; index++) {
    for (const list of lists) {
      const show = list[index];
      if (!show || seen.has(show.url)) continue;
      seen.add(show.url);
      merged.push(show);
      if (merged.length >= limit) break;
    }
  }
  return merged;
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

function episodeItems(channel) {
  return Array.from(channel.children).filter(item => item.localName === 'entry' || item.localName === 'item');
}

const publicationDate = item => text(item, 'pubDate') || text(item, 'published');

function* playableEntries(channel, base, now) {
  const seen = new Set();
  for (const item of episodeItems(channel)) {
    const published = publicationDate(item);
    if (Date.parse(published) > now) continue;
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
    yield { id, item, audio, published };
  }
}

function feedEpisode({ id, item, audio, published }, feed, show, artwork) {
  return {
    key: JSON.stringify([feed, id]), id, audio, title: text(item, 'title') || 'Untitled episode',
    feed, show, artwork, date: published || text(item, 'updated')
  };
}

export function readFeedEpisodes(xml, base, original, DOM = globalThis.DOMParser, now = Date.now()) {
  const channel = readChannel(xml, DOM);
  const title = text(channel, 'title') || 'Untitled podcast';
  const artwork = channelArtwork(channel, base);
  return Array.from(playableEntries(channel, base, now), entry => feedEpisode(entry, original, title, artwork));
}

const dayMs = 24 * 60 * 60_000;
// Compare local calendar dates without measuring elapsed hours across daylight saving changes.
const calendarDay = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
const weekday = day => new Date(day).getUTCDay();
const nextWeekday = day => day + (weekday(day) === 5 ? 3 : 1) * dayMs;

export function estimateReleasePattern(dates, now = Date.now()) {
  const days = [...new Set(dates.map(date => Date.parse(date))
    .filter(at => at <= now).map(at => calendarDay(new Date(at))))].sort((a, b) => b - a);
  const [latest] = days;
  const today = calendarDay(new Date(now));
  const matches = (count, next) => days.length >= count && next(latest) >= today &&
    days.slice(1, count).every((day, index) => next(day) === days[index]);
  if (matches(7, day => day + dayMs)) return { kind: 'estimated', cadence: 'daily' };
  if (days.slice(0, 7).every(day => weekday(day) >= 1 && weekday(day) <= 5) && matches(7, nextWeekday)) {
    return { kind: 'estimated', cadence: 'weekdays' };
  }
  if (matches(5, day => day + 7 * dayMs)) return { kind: 'estimated', cadence: 'weekly', weekday: weekday(latest) };
  if (matches(5, day => day + 14 * dayMs)) return { kind: 'estimated', cadence: 'fortnightly', weekday: weekday(latest) };
  return null;
}

function releaseTiming(channel, publishedEntries, now) {
  let upcoming = null;
  for (const item of episodeItems(channel)) {
    const at = Date.parse(publicationDate(item));
    if (at > now && (!upcoming || at < upcoming.at)) upcoming = { kind: 'scheduled', at, title: text(item, 'title') };
  }
  if (upcoming) return upcoming;
  const regularDates = publishedEntries.filter(({ item }) => !['bonus', 'trailer'].includes(text(item, 'episodeType').toLowerCase()));
  return estimateReleasePattern(regularDates.map(({ published }) => published), now);
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

export function episodeInboxUpdate(previous, episodes, opened = false) {
  const activity = episodeActivity(previous, episodes.map(episode => episode.id), opened);
  if (!previous) return { activity: { ...activity, inboxReady: true }, added: [] };
  const known = new Set(previous.known);
  // Older versions appended unread IDs to the end of the known list.
  const legacyUnread = new Set(!previous.inboxReady && previous.unread ? previous.known.slice(-previous.unread) : []);
  const added = episodes.filter(episode => !known.has(episode.id) || legacyUnread.has(episode.id));
  return {
    activity: activity === previous && previous.inboxReady ? previous : { ...activity, inboxReady: true }, added
  };
}

export function inboxNewestFirst(episodes) {
  const byDate = episode => {
    const published = Date.parse(episode.date);
    return Number.isNaN(published) ? episode.discoveredAt : published;
  };
  return [...episodes].sort((a, b) => byDate(b) - byDate(a));
}

export function parseFeed(xml, base, original, DOM = globalThis.DOMParser, now = Date.now()) {
  const channel = readChannel(xml, DOM);
  const title = text(channel, 'title') || 'Untitled podcast';
  const artwork = channelArtwork(channel, base);
  const episodeNotes = new Map();
  const entries = [...playableEntries(channel, base, now)];
  const episodes = entries.map(entry => {
    const episode = feedEpisode(entry, original, title, artwork);
    const fields = [...descriptionFields(entry.item, ['encoded', 'description', 'summary', 'content', 'subtitle'])];
    if (fields.length) episodeNotes.set(episode.key, fields);
    return episode;
  });
  return {
    url: original, title, artwork, language: text(channel, 'language').slice(0, 2).toLowerCase(), description: firstDescription(descriptionFields(channel, ['description', 'summary', 'subtitle'])),
    author: text(channel, 'author') || text(channel, 'creator'), episodes, releaseTiming: releaseTiming(channel, entries, now),
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

export function episodeFeed(key) {
  try {
    const parts = JSON.parse(key);
    if (Array.isArray(parts) && parts.length === 2 && typeof parts[0] === 'string' &&
        parts[0] && httpsUrl(parts[0]) === parts[0] && typeof parts[1] === 'string' && parts[1]) return parts[0];
  } catch { /* Invalid episode key. */ }
  return '';
}

export function resumeEpisode(value, key = value?.key) {
  const feed = episodeFeed(key);
  const clip = (field, limit) => typeof field === 'string' ? field.slice(0, limit) : '';
  const safeLink = field => typeof field === 'string' && field.length <= 2048 ? httpsUrl(field) : '';
  const audio = safeLink(value?.audio);
  if (!feed || !audio || value.feed !== feed) return null;
  return {
    key, feed, audio, title: clip(value.title, 300) || 'Untitled episode',
    show: clip(value.show, 200) || 'Podcast', artwork: safeLink(value.artwork),
    date: clip(value.date, 100)
  };
}

// Position zero means listened. The last 30 seconds count, except on clips of a minute or less.
export function savedPosition(position, duration) {
  return duration > 60 && duration - position <= 30 ? 0 : position;
}

export const queueLimit = 100;

// The synced form of a queue: complete, playable episodes only.
export function queueItems(items) {
  return Array.isArray(items) ? items.map(item => resumeEpisode(item)).filter(Boolean).slice(0, queueLimit) : [];
}

export function filterEpisodes(episodes, query, oldestFirst, notes = () => '') {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = words.length ? episodes.filter(episode => {
    const text = (episode.title + ' ' + notes(episode)).toLowerCase();
    return words.every(word => text.includes(word));
  }) : [...episodes];
  const when = episode => Date.parse(episode.date) || 0;
  return matches.sort((a, b) => oldestFirst ? when(a) - when(b) : when(b) - when(a));
}

export function recentProgress(progress, timestamps, currentKey, localTimestamps = {}, dismissedAt = {}) {
  return Object.entries(progress)
    .filter(([key, position]) => Number.isFinite(position) && position > 0 && episodeFeed(key))
    .map(([key, position]) => ({ key, position, at: Math.max(timestamps[key] ?? 0, localTimestamps[key] ?? 0) }))
    // A removed episode stays hidden until it is played again.
    .filter(({ key, at }) => !(dismissedAt[key] >= at))
    .sort((a, b) => b.at - a.at || Number(b.key === currentKey) - Number(a.key === currentKey));
}

export function time(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const mins = Math.floor(value / 60);
  const tail = String(value % 60).padStart(2, '0');
  return mins < 60 ? mins + ':' + tail : Math.floor(mins / 60) + ':' + String(mins % 60).padStart(2, '0') + ':' + tail;
}

// App-wide settings. Each value is limited to the choices the Settings page offers.
export const settingChoices = {
  skipBack: [5, 10, 15, 20, 30, 45, 60],
  skipForward: [10, 15, 20, 30, 45, 60, 90],
  disconnectRewind: [0, 5, 10, 15, 20, 30, 45, 60],
  callRewind: [0, 3, 5, 10, 15, 20, 30]
};
export const defaultSettings = { skipBack: 15, skipForward: 30, disconnectRewind: 15, callRewind: 5 };

export function readSettings(value) {
  const settings = { ...defaultSettings };
  for (const [name, choices] of Object.entries(settingChoices)) {
    const chosen = Number(value?.[name]);
    if (choices.includes(chosen)) settings[name] = chosen;
  }
  return settings;
}
