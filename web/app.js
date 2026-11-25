import { catalog, categories, directoryShows, chartIds, rankedShows, httpsUrl, parseFeed, readArtwork, enqueue, time } from './model.js';

const $ = selector => document.querySelector(selector);
const native = window.OnionNative;
const audio = native ? null : new Audio();
const key = 'onionpod-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(key)) ?? {}; } catch { saved = {}; }
const state = {
  follows: saved.follows ?? [], queue: saved.queue ?? [], progress: saved.progress ?? {},
  downloads: saved.downloads ?? [], current: saved.current ?? null, rate: saved.rate ?? 1,
  page: 'discover', show: null, query: '', results: null, message: '', loading: false
};
let position = state.progress[state.current?.key] ?? 0;
let duration = 0;
let playing = false;
let activeKey = '';
let busy = false;
let lastCheckpoint = 0;
let generation = 0;
let noticeTimer;
let nativeId = 0;
let endedKey = '';
const waiting = new Map();
const chartCache = new Map();
const searchCache = new Map();
const initialRoute = { page: 'discover', depth: 0 };
const tabs = {
  discover: 'Discover', categories: 'Categories', category: 'Categories', show: 'Podcast',
  library: 'Library', queue: 'Queue', downloads: 'Downloads'
};
const coverUrls = new Map(catalog.map(show => [show.url, show.artwork]));
const coverJobs = new Map();
let activeCoverJobs = 0;
const pendingCovers = [];
const artworkReady = setupArtworkCache();
const coverObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    coverObserver.unobserve(entry.target);
    pendingCovers.push(entry.target);
  }
  loadVisibleCovers();
});

if (native) {
  $('[data-page=downloads]').hidden = false;
  native.onmessage = event => {
    const { id, value, error } = JSON.parse(event.data);
    const pending = waiting.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    waiting.delete(id);
    if (error) pending.reject(new Error(error));
    else pending.resolve(value);
  };
}
function android(action, data = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nativeId;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('Android did not respond. Try again.'));
    }, 20000);
    waiting.set(id, { timer, resolve, reject });
    native.postMessage(JSON.stringify({ id, action, data }));
  });
}

function save() {
  const { follows, queue, progress, current, rate, downloads } = state;
  try { localStorage.setItem(key, JSON.stringify({ follows, queue, progress, current, rate, downloads })); }
  catch { notice('OnionPod could not save changes on this device.'); }
}

function notice(message) {
  const element = $('#notice');
  element.hidden = false;
  element.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { element.hidden = true; }, 4800);
}

function el(tag, cls, label) {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (label !== undefined) element.textContent = label;
  return element;
}
function button(label, fn, cls = 'outline') {
  const element = el('button', cls, label);
  element.type = 'button';
  element.addEventListener('click', fn);
  return element;
}
function setupArtworkCache() {
  if (!('serviceWorker' in navigator)) return Promise.resolve();
  const worker = navigator.serviceWorker;
  worker.register('./artwork-worker.js').catch(() => {});
  if (worker.controller) return Promise.resolve();
  return new Promise(resolve => {
    const ready = () => {
      clearTimeout(timer);
      worker.removeEventListener('controllerchange', ready);
      resolve();
    };
    const timer = setTimeout(ready, 1200);
    worker.addEventListener('controllerchange', ready);
  });
}

function showImage(panel, source) {
  if (!httpsUrl(source)) return;
  const image = el('img');
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => {
    navigator.serviceWorker?.controller?.postMessage({ type: 'forget-artwork', url: source });
    image.remove();
  });
  artworkReady.then(() => {
    if (!panel.isConnected) return;
    image.src = source;
    panel.append(image);
  });
}

function loadVisibleCovers() {
  while (activeCoverJobs < 3 && pendingCovers.length) {
    const panel = pendingCovers.shift();
    if (!panel.isConnected) continue;
    const url = panel.dataset.artworkFeed;
    let job = coverJobs.get(url);
    if (coverUrls.has(url)) {
      showImage(panel, coverUrls.get(url));
      continue;
    }
    if (!job) {
      activeCoverJobs++;
      job = request('/api/feed?url=' + encodeURIComponent(url), url)
        .then(data => {
          const source = readArtwork(data.body, data.url);
          coverUrls.set(url, source);
          return source;
        })
        .catch(() => '')
        .finally(() => {
          coverJobs.delete(url);
          activeCoverJobs--;
          loadVisibleCovers();
        });
      coverJobs.set(url, job);
    }
    job.then(source => { if (panel.isConnected) showImage(panel, source); });
  }
}

function artwork(item, cls = 'cover', lookup = false) {
  const fallback = item.mark ?? item.title?.slice(0, 1) ?? '◉';
  const panel = el('div', cls + (item.color ? ' ' + item.color : ''), fallback);
  panel.setAttribute('aria-hidden', 'true');
  const source = item.artwork || coverUrls.get(item.url ?? item.feed);
  if (source) showImage(panel, source);
  else if (lookup && httpsUrl(item.url ?? item.feed)) {
    panel.dataset.artworkFeed = item.url ?? item.feed;
    coverObserver.observe(panel);
  }
  return panel;
}

function grid(items) {
  const panel = el('div', 'grid');
  for (const item of items) {
    const card = button('', () => openFeed(item.url, item), 'card');
    card.append(artwork(item, 'cover', true), el('strong', '', item.title), el('small', '', item.author || 'Podcast'));
    if (item.category) card.append(el('small', 'category', item.category));
    panel.append(card);
  }
  return panel;
}

function navigate(route) {
  const previous = history.state?.onionPod ?? initialRoute;
  if (route.page === previous.page && route.query === previous.query &&
      route.categoryId === previous.categoryId && route.url === previous.url) return;
  const next = { ...route, depth: previous.depth + 1 };
  history.pushState({ onionPod: next }, '');
  showRoute(next);
}

function showRoute(route) {
  const version = ++generation;
  state.page = route.page;
  state.loading = false;
  state.message = '';
  $('#feed-dialog').close();
  if (route.page === 'category') {
    loadCategory(categories.find(category => category.id === route.categoryId), version);
  } else if (route.page === 'show') {
    state.returnPage = route.from;
    state.backLabel = route.backLabel;
    loadFeed(route.url, route.hint, version);
  } else if (route.page === 'discover' && route.query) {
    loadSearch(route.query, version);
  } else {
    if (route.page === 'discover') { state.query = ''; state.results = null; }
    render();
  }
  window.scrollTo(0, 0);
}

function goBack() {
  if (history.state?.onionPod?.depth > 0) history.back();
}

function insertList(target, episodes, context) {
  if (!episodes.length) {
    target.append(el('p', 'empty', {
      feed: 'No playable HTTPS audio episodes were found in this feed.',
      queue: 'Your queue is empty. Add an episode to line up what plays next.',
      downloads: 'Your downloads will appear here.'
    }[context]));
    return;
  }
  const list = el('div', 'episodes');
  for (const [index, episode] of episodes.entries()) {
    const row = el('article', 'episode');
    if (state.current?.key === episode.key) row.dataset.active = '';
    const info = el('div');
    const date = new Date(episode.date);
    const progress = state.progress[episode.key];
    const meta = [context !== 'feed' ? episode.show : '', !Number.isNaN(date.valueOf()) ? date.toLocaleDateString() : '', progress ? 'Resume at ' + time(progress) : ''];
    if (context === 'downloads') meta.push({ pending: 'Downloading', ready: 'Available offline', failed: 'Download failed' }[episode.downloadState] ?? 'Checking download');
    info.append(el('strong', '', episode.title), el('small', '', meta.filter(Boolean).join(' · ')));
    const actions = el('div', 'actions');
    actions.append(button(state.current?.key === episode.key ? 'Play / pause' : 'Play', () => start(episode)));
    if (context === 'queue') {
      const up = button('Move up', () => {
        [state.queue[index - 1], state.queue[index]] = [state.queue[index], state.queue[index - 1]];
        save(); render();
      });
      up.disabled = index === 0;
      actions.append(up, button('Remove', () => { state.queue = state.queue.filter(item => item.key !== episode.key); save(); render(); }));
    } else if (context !== 'downloads') {
      const add = button('Queue', () => {
        state.queue = enqueue(state.queue, episode);
        save(); render();
        notice('Added to your queue.');
      });
      add.disabled = state.queue.some(item => item.key === episode.key);
      actions.append(add);
    }
    if (native) {
      const downloaded = state.downloads.find(item => item.key === episode.key);
      if (context === 'downloads') {
        if (episode.downloadState === 'failed') actions.append(button('Retry', () => download(episode)));
        actions.append(button('Remove', () => removeDownload(episode)));
      } else {
        const downloadButton = button(downloaded ? 'In Downloads' : 'Download', () => downloaded ? go('downloads') : download(episode));
        actions.append(downloadButton);
      }
    }
    row.append(info, actions);
    list.append(row);
  }
  target.append(list);
}

function render() {
  const page = state.page;
  $('#app-back').hidden = !history.state?.onionPod?.depth || page === 'show' || page === 'category';
  const parent = page === 'show' ? state.returnPage : page;
  const activeTab = parent === 'category' ? 'categories' : parent;
  for (const tab of document.querySelectorAll('[data-page]')) {
    const selected = tab.dataset.page === activeTab;
    if (selected) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  $('#queue-count').textContent = state.queue.length || '';
  $('#section-label').textContent = tabs[page];
  const content = $('#content');
  for (const panel of content.querySelectorAll('[data-artwork-feed]')) coverObserver.unobserve(panel);
  content.replaceChildren();
  if (page === 'discover') {
    const hero = el('section', 'hero');
    const form = el('form', 'search');
    const input = el('input');
    input.type = 'search'; input.required = true; input.maxLength = 120;
    input.placeholder = 'Search for a podcast'; input.value = state.query;
    input.setAttribute('aria-label', 'Search for a podcast');
    form.append(input, el('button', 'primary', 'Search'));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const query = input.value.trim();
      if (query) navigate({ page: 'discover', query });
    });
    hero.append(el('h1', '', 'Find your next listen.'), el('p', '', 'Search for a podcast or browse the picks below.'), form);
    content.append(hero);
    const section = el('section', 'section');
    const heading = el('div', 'section-head');
    heading.append(el('h2', '', state.results ? 'Search results' : 'Explore podcasts'));
    if (state.results) heading.append(button('Clear search', () => navigate({ page: 'discover' })));
    section.append(heading);
    if (state.loading || state.message) {
      section.append(el('p', 'empty', state.message || 'Searching…'));
      if (state.message) section.append(button('Try again', () => loadSearch(state.query, ++generation)));
    }
    else if (state.results && !state.results.length) section.append(el('p', 'empty', 'No podcasts matched your search.'));
    else section.append(grid(state.results ?? catalog));
    content.append(section);
  } else if (page === 'categories') {
    const list = el('div', 'category-grid');
    for (const category of categories) {
      const card = button('', () => navigate({ page: 'category', categoryId: category.id }), 'category-card');
      const mark = el('span', 'category-mark', category.mark);
      mark.setAttribute('aria-hidden', 'true');
      card.append(mark, el('strong', '', category.title));
      list.append(card);
    }
    content.append(el('h1', '', 'Categories'), list);
  } else if (page === 'category') {
    const category = state.category;
    content.append(button('Back to categories', goBack, 'back'), el('h1', '', category.title));
    if (state.loading || state.message) {
      const status = el('p', 'empty', state.message || 'Loading podcasts…');
      status.setAttribute('role', 'status');
      content.append(status);
      if (state.message) content.append(button('Try again', () => loadCategory(category, ++generation)));
    } else {
      const heading = el('div', 'section-head');
      heading.append(el('h2', '', 'Top podcasts'), el('small', '', 'Apple Podcasts · US'));
      const shows = chartCache.get(category.id) ?? [];
      content.append(heading, shows.length ? grid(shows) : el('p', 'empty', 'No public HTTPS feeds are available in this category right now.'));
    }
  } else if (page === 'show') {
    content.append(button(state.backLabel, goBack, 'back'));
    if (!state.show) {
      content.append(el('p', 'empty', state.message || 'Loading episodes…'));
      return;
    }
    const show = state.show;
    const intro = el('section', 'show-header');
    const copy = el('div');
    const following = state.follows.some(item => item.url === show.url);
    copy.append(el('h1', '', show.title), el('p', 'meta', show.author || 'Podcast'));
    copy.append(button(following ? 'Unfollow' : 'Follow podcast', () => {
      if (following) state.follows = state.follows.filter(item => item.url !== show.url);
      else {
        const { episodes, ...details } = show;
        state.follows.push(details);
      }
      save(); render();
    }, following ? 'outline' : 'primary'));
    intro.append(artwork(show), copy);
    content.append(intro);
    if (show.description) {
      const about = el('section', 'show-description');
      about.append(el('h2', '', 'About the podcast'), el('p', '', show.description));
      content.append(about);
    }
    const header = el('div', 'section-head');
    header.append(el('h2', '', 'Episodes'), el('small', '', String(show.episodes.length)));
    content.append(header);
    insertList(content, show.episodes.slice(0, state.episodeLimit), 'feed');
    if (show.episodes.length > state.episodeLimit) {
      const more = button('Show more episodes', () => { state.episodeLimit += 50; render(); });
      more.classList.add('more');
      content.append(more);
    }
  } else {
    content.append(el('h1', '', { library: 'Your library', queue: 'Up next', downloads: 'Downloads' }[page]));
    if (page === 'library') content.append(state.follows.length ? grid(state.follows) : el('p', 'empty', 'Follow a podcast to find it here.'));
    else insertList(content, page === 'queue' ? state.queue : state.downloads, page);
  }
}

async function request(endpoint, url) {
  if (native) return android('fetch', { url });
  const response = await fetch(endpoint);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The source is unavailable.');
  return data;
}

function requestSource(url) {
  return request('/api/feed?url=' + encodeURIComponent(url), url);
}

async function loadCategory(category, version) {
  state.category = category;
  state.message = '';
  state.loading = !chartCache.has(category.id);
  render();
  if (!state.loading) return;
  try {
    const chart = await requestSource('https://itunes.apple.com/us/rss/toppodcasts/limit=25/genre=' + category.id + '/json');
    if (version !== generation) return;
    const ids = chartIds(JSON.parse(chart.body));
    let shows = [];
    if (ids.length) {
      const query = new URLSearchParams({ id: ids.join(','), entity: 'podcast', country: 'US' });
      const details = await requestSource('https://itunes.apple.com/lookup?' + query);
      shows = rankedShows(ids, JSON.parse(details.body).results ?? []);
    }
    chartCache.set(category.id, shows);
  } catch {
    if (version === generation) state.message = 'This category could not load. Try again in a moment.';
  } finally {
    if (version === generation) { state.loading = false; render(); }
  }
}

async function loadSearch(query, version) {
  state.query = query;
  state.loading = !searchCache.has(query);
  state.results = searchCache.get(query) ?? [];
  render();
  if (!state.loading) return;
  try {
    const params = new URLSearchParams({ term: query, media: 'podcast', limit: '18' });
    const { body } = await request('/api/search?q=' + encodeURIComponent(query), 'https://itunes.apple.com/search?' + params);
    if (version !== generation) return;
    state.results = directoryShows(JSON.parse(body).results ?? []);
    searchCache.set(query, state.results);
  } catch (error) {
    if (version === generation) state.message = 'Search could not load. ' + error.message;
  } finally {
    if (version === generation) { state.loading = false; render(); }
  }
}

function openFeed(value, hint = {}) {
  const url = httpsUrl(value);
  if (!url) { notice('Enter a valid HTTPS feed URL.'); return; }
  const from = state.page === 'show' ? state.returnPage : state.page;
  const back = state.page === 'show' ? 'previous podcast'
    : state.page === 'category' ? state.category.title : tabs[from].toLowerCase();
  navigate({ page: 'show', url, hint, from, backLabel: 'Back to ' + back });
}

async function loadFeed(url, hint, version) {
  state.show = null;
  state.episodeLimit = 50;
  render();
  try {
    const data = await requestSource(url);
    const show = parseFeed(data.body, data.url, url);
    if (show.artwork) coverUrls.set(url, show.artwork);
    if (version === generation) state.show = { ...hint, ...show, artwork: show.artwork || hint.artwork, author: show.author || hint.author };
  } catch (error) {
    if (version === generation) state.message = 'Could not open this feed. ' + error.message;
  } finally { if (version === generation) render(); }
}

async function download(episode) {
  try {
    const downloadState = await android('download', episode);
    state.downloads = [...state.downloads.filter(item => item.key !== episode.key), { ...episode, downloadState }];
    save(); render();
    notice(downloadState === 'ready' ? 'Episode is available offline.' : 'Download started.');
  } catch (error) { notice(error.message); }
}
async function removeDownload(episode) {
  try {
    await android('remove', episode);
    state.downloads = state.downloads.filter(item => item.key !== episode.key);
    save(); render();
  } catch (error) { notice(error.message); }
}

function checkpoint(force = false) {
  if (!state.current || activeKey !== state.current.key || (!force && Date.now() - lastCheckpoint < 3500)) return;
  state.progress[state.current.key] = position;
  lastCheckpoint = Date.now();
  save();
}

function player() {
  const current = state.current;
  $('#now-title').textContent = current?.title ?? 'Nothing playing';
  $('#now-show').textContent = current?.show ?? 'Choose an episode to start';
  const cover = $('#now-cover');
  if (cover.dataset.key !== current?.key && current) {
    coverObserver.unobserve(cover);
    const next = artwork(current, 'mini-cover', true); next.id = 'now-cover'; next.dataset.key = current.key; cover.replaceWith(next);
  }
  $('#toggle').textContent = playing ? '❚❚' : '▶';
  $('#toggle').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('#toggle').disabled = !current;
  $('#rewind').disabled = $('#forward').disabled = $('#seek').disabled = !duration;
  $('#elapsed').textContent = time(position);
  $('#duration').textContent = time(duration);
  $('#seek').max = Math.floor(duration) || 0;
  if (!$('#seek').matches(':active')) $('#seek').value = Math.floor(position);
  $('#seek').setAttribute('aria-valuetext', time(position));
}

async function start(episode, fromQueue = false) {
  if (busy) return false;
  busy = true;
  try {
    if (!fromQueue && episode.key === activeKey) {
      if (native) await android('toggle');
      else if (audio.paused) await audio.play();
      else audio.pause();
    } else {
      checkpoint(true);
      if (native) {
        await android('load', { ...episode, rate: state.rate });
        state.current = episode;
        activeKey = episode.key;
      } else {
        state.current = episode;
        activeKey = episode.key;
        audio.src = episode.audio;
        audio.playbackRate = state.rate;
        const resume = state.progress[episode.key] ?? 0;
        if (resume > 0) audio.currentTime = resume;
        if ('mediaSession' in navigator && 'MediaMetadata' in window) {
          const cover = episode.artwork || coverUrls.get(episode.feed);
          navigator.mediaSession.metadata = new MediaMetadata({
            title: episode.title, artist: episode.show, artwork: httpsUrl(cover) ? [{ src: cover }] : []
          });
        }
      }
      endedKey = '';
      duration = 0;
      position = state.progress[episode.key] ?? 0;
      save(); render(); player();
      if (audio) await audio.play();
      if (!fromQueue && state.queue.some(item => item.key === episode.key)) {
        state.queue = state.queue.filter(item => item.key !== episode.key);
        save(); render();
      }
    }
    return true;
  } catch (error) {
    notice('Playback could not start. ' + error.message);
    return false;
  } finally { busy = false; }
}

async function advance() {
  const current = state.current;
  if (!current || endedKey === current.key || busy) return;
  endedKey = current.key;
  position = 0; playing = false; checkpoint(true); player();
  const next = state.queue[0];
  if (next && await start(next, true)) {
    state.queue = state.queue.filter(item => item.key !== next.key);
    save(); render();
  }
}

async function seek(value) {
  if (!activeKey || !duration) return;
  const target = Math.max(0, Math.min(duration, value));
  try {
    if (native) await android('seek', { position: target });
    else audio.currentTime = target;
    position = target;
    checkpoint(true); player();
  } catch (error) { notice(error.message); }
}

if (audio) {
  for (const event of ['timeupdate', 'durationchange', 'play', 'pause', 'seeked']) {
    audio.addEventListener(event, () => {
      position = audio.currentTime;
      duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      playing = !audio.paused && !audio.ended;
      if (playing) endedKey = '';
      if (!audio.ended && audio.readyState > 0) checkpoint(event === 'pause' || event === 'seeked');
      player();
    });
  }
  audio.addEventListener('ended', advance);
  audio.addEventListener('error', () => notice('This episode could not be played. Check your connection and try another episode.'));
  if ('mediaSession' in navigator) {
    for (const [action, callback] of Object.entries({
      play: () => audio.play().catch(error => notice(error.message)), pause: () => audio.pause(),
      seekbackward: () => seek(position - 15), seekforward: () => seek(position + 30),
      seekto: details => seek(details.seekTime)
    })) {
      try { navigator.mediaSession.setActionHandler(action, callback); } catch { /* Browser support varies. */ }
    }
  }
} else {
  let polling = false;
  setInterval(async () => {
    if (polling || busy || !state.current) return;
    polling = true;
    try {
      const status = await android('status');
      if (!busy && status.key === state.current?.key) {
        activeKey = status.key;
        position = status.position; duration = status.duration; playing = status.playing;
        if (status.error && status.error !== state.playbackError) notice(status.error);
        state.playbackError = status.error;
        if (playing) endedKey = '';
        if (status.ended) await advance();
        else checkpoint();
        player();
      }
    } catch { /* Controller may still be connecting. */ }
    finally { polling = false; }
  }, 750);
  let checkingDownloads = false;
  setInterval(async () => {
    if (checkingDownloads) return;
    checkingDownloads = true;
    let changed = false;
    for (const item of state.downloads.filter(entry => entry.downloadState === 'pending' || !entry.checked)) {
      try {
        const status = await android('offline', item);
        item.checked = true;
        if (status !== item.downloadState) { item.downloadState = status; changed = true; }
      } catch { /* Retry on the next pass. */ }
    }
    if (changed) { save(); if (state.page === 'downloads') render(); }
    checkingDownloads = false;
  }, 2500);
  for (const item of state.downloads) item.checked = false;
}

for (const tab of document.querySelectorAll('[data-page]')) {
  tab.addEventListener('click', () => navigate({ page: tab.dataset.page }));
}
$('#app-back').onclick = goBack;
$('#add-feed').onclick = () => $('#feed-dialog').showModal();
$('#cancel-feed').onclick = () => $('#feed-dialog').close();
$('#feed-form').onsubmit = event => {
  event.preventDefault();
  const input = $('#feed-url');
  if (!httpsUrl(input.value)) { notice('Enter a valid HTTPS feed URL.'); return; }
  $('#feed-dialog').close(); openFeed(input.value); input.value = '';
};
$('#toggle').onclick = () => { if (state.current) start(state.current); };
$('#rewind').onclick = () => seek(position - 15);
$('#forward').onclick = () => seek(position + 30);
$('#seek').onchange = event => seek(Number(event.target.value));
$('#rate').value = state.rate;
$('#rate').onchange = async event => {
  state.rate = Number(event.target.value);
  save();
  try {
    if (native && activeKey) await android('rate', { rate: state.rate });
    else if (audio) audio.playbackRate = state.rate;
  } catch (error) { notice(error.message); }
};
window.addEventListener('pagehide', () => checkpoint(true));
window.addEventListener('popstate', event => showRoute(event.state?.onionPod ?? initialRoute));
if (!history.state?.onionPod) history.replaceState({ onionPod: initialRoute }, '');
showRoute(history.state.onionPod);
player();
