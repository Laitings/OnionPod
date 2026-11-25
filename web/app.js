import { catalog, categories, podcastCategory, directoryShows, chartIds, rankedShows, httpsUrl, parseFeed, readArtwork, readEpisodeIds, episodeActivity, enqueue, time } from './model.js';
import { createSync } from './sync.js';

const $ = selector => document.querySelector(selector);
const native = window.OnionNative;
const audio = native ? null : new Audio();
const key = 'onionpod-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(key)) ?? {}; } catch { saved = {}; }
const state = {
  follows: saved.follows ?? [], queue: saved.queue ?? [], progress: saved.progress ?? {},
  episodeActivity: saved.episodeActivity ?? {},
  downloads: saved.downloads ?? [], current: saved.current ?? null, rate: saved.rate ?? 1,
  openEpisodeNotes: new Set(),
  page: 'discover', show: null, query: '', results: null, message: '', loading: false
};
let position = state.progress[state.current?.key] ?? 0;
let duration = 0;
let playing = false;
let activeKey = '';
let busy = false;
let lastCheckpoint = 0;
const observedPositions = new Map();
let generation = 0;
let noticeTimer;
let nativeId = 0;
let endedKey = '';
const waiting = new Map();
const feedCheckAfter = new Map();
const feedCheckInterval = 5 * 60_000;
let checkingFollows = false;
const chartCache = new Map();
const exploreKey = 'onionpod-explore-v2';
const exploreMaxAge = 60 * 60_000;
let explore = readExploreCache();
let exploreJob = false;
let exploreRetryAfter = 0;
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
const artworkWorkerScript = new URL('./artwork-worker.js?v=2', window.location.href).href;
const artworkReady = setupArtworkCache();
const sync = createSync({
  saved: saved.syncState,
  call: syncRequest,
  persist: save,
  local: () => ({ follows: state.follows, progress: state.progress }),
  collect: native ? async ingest => {
    const pending = await android('local-progress');
    if (!pending.length) return;
    ingest(pending);
    if (save()) await android('local-progress-ack', { events: pending });
  } : null,
  apply: applySync,
  paint: paintSync
});
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
  const { follows, queue, progress, current, rate, downloads, episodeActivity } = state;
  try {
    localStorage.setItem(key, JSON.stringify({ follows, queue, progress, current, rate, downloads, episodeActivity, syncState: sync.data }));
    return true;
  } catch {
    notice('OnionPod could not save changes on this device.');
    return false;
  }
}

async function syncRequest(action, data) {
  let status, body;
  if (native) {
    ({ status, body } = await android('sync-' + action, data));
  } else {
    const response = await fetch('/api/sync/' + action, data === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    status = response.status;
    try { body = await response.json(); } catch { body = {}; }
  }
  if (status >= 200 && status < 300 && (action !== 'session' || typeof body?.enabled === 'boolean')) return body;
  const error = new Error(body?.error || (status === 403
    ? 'This network cannot reach the private sync server.' : 'The sync server is unavailable.'));
  error.status = status;
  throw error;
}

function applySync(changes) {
  let libraryChanged = false;
  let progressChanged = false;
  for (const { type, key, value } of changes) {
    if (type === 'follow') {
      const existing = state.follows.some(show => show.url === key);
      if (value === null && existing) {
        state.follows = state.follows.filter(show => show.url !== key);
        delete state.episodeActivity[key];
        feedCheckAfter.delete(key);
        libraryChanged = true;
      } else if (value && !existing) {
        state.follows.push(value);
        libraryChanged = true;
      }
    } else if (state.progress[key] !== value) {
      state.progress[key] = value;
      progressChanged = true;
      if (state.current?.key === key && !playing && !activeKey) {
        position = value;
        player();
      }
    }
  }
  if (libraryChanged || (progressChanged && !playing && ['show', 'queue', 'downloads'].includes(state.page))) render();
  if (libraryChanged) refreshFollowedFeeds();
}

function paintSync() {
  const { enabled, message } = sync.status();
  const connected = sync.data.signedIn;
  $('#sync-form').hidden = connected || enabled === false;
  $('#sync-controls').hidden = !connected;
  $('#sync-status').textContent = message || (connected ? 'Signed in. Your follows and listening progress sync here.'
    : enabled === false ? 'Sync is waiting for the server account to be set up.'
      : 'Sign in with the same OnionPod sync password on both devices.');
  refreshExplore();
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
  worker.register(artworkWorkerScript).catch(() => {});
  if (worker.controller?.scriptURL === artworkWorkerScript) return Promise.resolve();
  return new Promise(resolve => {
    const ready = () => {
      clearTimeout(timer);
      worker.removeEventListener('controllerchange', changed);
      resolve();
    };
    const changed = () => {
      if (worker.controller?.scriptURL === artworkWorkerScript) ready();
    };
    const timer = setTimeout(ready, 1200);
    worker.addEventListener('controllerchange', changed);
  });
}

function showImage(panel, source, retryAfterUpdate = true) {
  if (!httpsUrl(source)) return;
  const image = el('img');
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => {
    const worker = navigator.serviceWorker;
    worker?.controller?.postMessage({ type: 'forget-artwork', url: source });
    image.remove();
    if (retryAfterUpdate && worker?.controller && worker.controller.scriptURL !== artworkWorkerScript) {
      worker.addEventListener('controllerchange', () => showImage(panel, source, false), { once: true });
    }
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

function updateEpisodeBadges() {
  for (const badge of document.querySelectorAll('[data-episode-badge]')) {
    const count = state.episodeActivity[badge.dataset.episodeBadge]?.unread ?? 0;
    badge.hidden = count === 0;
    badge.firstChild.textContent = String(count);
    badge.lastChild.textContent = count === 1 ? ' new episode' : ' new episodes';
  }
}

function toggleFollow(show) {
  const url = show.url;
  const following = state.follows.some(item => item.url === url);
  if (following) {
    state.follows = state.follows.filter(item => item.url !== url);
    delete state.episodeActivity[url];
    feedCheckAfter.delete(url);
    sync.record('follow', url, null, true);
  } else {
    const { episodes, notesFor, ...details } = show;
    details.artwork ||= coverUrls.get(url);
    state.follows.push(details);
    if (episodes) markShowOpened(show);
    sync.record('follow', url, details, true);
  }
  save();
  if (!following) refreshFollowedFeeds();
  return !following;
}

function paintFollowButton(control, title, following) {
  control.textContent = following ? '✓' : '+';
  control.setAttribute('aria-pressed', String(following));
  control.title = (following ? 'Unfollow ' : 'Follow ') + title;
}

function grid(items) {
  const panel = el('div', 'grid');
  const followed = new Set(state.follows.map(show => show.url));
  const inLibrary = state.page === 'library';
  for (const item of items) {
    const wrapper = el('article', 'podcast-card');
    const card = button('', () => openFeed(item.url, item), 'card');
    card.append(artwork(item, 'cover', true), el('strong', '', item.title), el('small', '', item.author || 'Podcast'));
    const badge = el('span', 'episode-badge');
    badge.dataset.episodeBadge = item.url;
    badge.hidden = true;
    badge.append(el('span'), el('span', 'sr-only'));
    card.append(badge);
    const followButton = button('', () => {
      const isFollowing = toggleFollow(item);
      if (inLibrary && !isFollowing) {
        const index = Array.from(panel.children).indexOf(wrapper);
        render();
        const controls = document.querySelectorAll('#content .card-follow');
        (controls[Math.min(index, controls.length - 1)] ?? $('[data-page=library]')).focus();
      } else {
        paintFollowButton(followButton, item.title, isFollowing);
        updateEpisodeBadges();
      }
    }, 'card-follow');
    followButton.setAttribute('aria-label', 'Follow ' + item.title);
    paintFollowButton(followButton, item.title, followed.has(item.url));
    const actions = el('div', 'card-actions');
    const category = podcastCategory(item);
    if (category) {
      const categoryButton = button(category.title, () => openCategory(category), 'card-category');
      categoryButton.setAttribute('aria-label', 'Browse ' + category.title);
      actions.append(categoryButton);
    }
    actions.append(followButton);
    wrapper.append(card, actions);
    panel.append(wrapper);
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

function openCategory(category) {
  const from = state.page === 'category' ? state.category.title : tabs[state.page].toLowerCase();
  navigate({ page: 'category', categoryId: category.id, categoryTitle: category.title, backLabel: 'Back to ' + from });
}

function showRoute(route) {
  const version = ++generation;
  state.page = route.page;
  state.loading = false;
  state.message = '';
  $('#feed-dialog').close();
  if (route.page === 'category') {
    state.categoryBackLabel = route.backLabel ?? 'Back to categories';
    const category = categories.find(item => item.id === route.categoryId)
      ?? { id: route.categoryId, title: route.categoryTitle };
    loadCategory(category, version);
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
  if (route.page === 'library') refreshFollowedFeeds();
  if (route.page === 'discover' && !route.query) refreshExplore();
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
    const notes = context === 'feed' ? state.show.notesFor(episode.key) : '';
    if (notes) {
      const details = el('details', 'episode-notes');
      details.open = state.openEpisodeNotes.has(episode.key);
      const summary = el('summary', '', 'Show notes');
      summary.setAttribute('aria-label', 'Show notes for ' + episode.title);
      details.append(summary, el('div', 'episode-notes-text', notes));
      details.addEventListener('toggle', () => {
        if (!details.isConnected) return;
        if (details.open) state.openEpisodeNotes.add(episode.key);
        else state.openEpisodeNotes.delete(episode.key);
      });
      row.append(details);
    }
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
    hero.append(el('h1', '', 'Find your next listen.'), el('p', '', 'Search for a podcast or explore popular shows.'), form);
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
    else if (state.results) section.append(grid(state.results));
    else {
      const source = el('small');
      source.id = 'explore-source';
      heading.append(source);
      const region = el('div');
      region.id = 'explore-list';
      section.append(region);
    }
    content.append(section);
    paintExplore();
  } else if (page === 'categories') {
    const list = el('div', 'category-grid');
    for (const category of categories) {
      const card = button('', () => openCategory(category), 'category-card');
      const mark = el('span', 'category-mark', category.mark);
      mark.setAttribute('aria-hidden', 'true');
      card.append(mark, el('strong', '', category.title));
      list.append(card);
    }
    content.append(el('h1', '', 'Categories'), list);
  } else if (page === 'category') {
    const category = state.category;
    content.append(button(state.categoryBackLabel, goBack, 'back'), el('h1', '', category.title));
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
      toggleFollow(show);
      render();
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
  updateEpisodeBadges();
}

async function request(endpoint, url) {
  if (native) return android('fetch', { url });
  const response = await fetch(endpoint);
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) sync.session();
    throw new Error(data.error || 'The source is unavailable.');
  }
  return data;
}

function requestSource(url) {
  return request('/api/feed?url=' + encodeURIComponent(url), url);
}

function readExploreCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(exploreKey));
    if (Array.isArray(cached?.shows) && cached.shows.length && Number.isFinite(cached.refreshedAt)) {
      return cached;
    }
  } catch { /* The built-in list is available on first launch and if storage fails. */ }
  return { shows: [], refreshedAt: 0 };
}

function paintExplore() {
  const region = $('#explore-list');
  if (!region || region.contains(document.activeElement)) return;
  for (const panel of region.querySelectorAll('[data-artwork-feed]')) coverObserver.unobserve(panel);
  const hasChart = explore.shows.length > 0;
  $('#explore-source').textContent = hasChart ? 'Popular in the U.S. · Apple Podcasts' : 'Featured picks';
  region.replaceChildren(grid(hasChart ? explore.shows : catalog));
  updateEpisodeBadges();
}

async function chartShows(categoryId) {
  const genre = categoryId ? '/genre=' + categoryId : '';
  const chart = await requestSource('https://itunes.apple.com/us/rss/toppodcasts/limit=25' + genre + '/json');
  const ids = chartIds(JSON.parse(chart.body));
  if (!ids.length) return [];
  const query = new URLSearchParams({ id: ids.join(','), entity: 'podcast', country: 'US' });
  const details = await requestSource('https://itunes.apple.com/lookup?' + query);
  return rankedShows(ids, JSON.parse(details.body).results ?? []);
}

async function refreshExplore() {
  const { relayRequiresLogin } = sync.status();
  if (state.page !== 'discover' || state.query || document.hidden || !navigator.onLine || exploreJob ||
      Date.now() - explore.refreshedAt < exploreMaxAge || Date.now() < exploreRetryAfter ||
      (!native && relayRequiresLogin !== false && !sync.data.signedIn)) return;
  exploreJob = true;
  try {
    const shows = (await chartShows()).slice(0, 16);
    if (!shows.length) throw new Error('The chart did not include public feeds.');
    explore = { shows, refreshedAt: Date.now() };
    try { localStorage.setItem(exploreKey, JSON.stringify(explore)); } catch { /* Fresh results remain available in memory. */ }
    paintExplore();
  } catch (error) {
    exploreRetryAfter = error.status === 401 ? 0 : Date.now() + 60_000;
  } finally {
    exploreJob = false;
  }
}

function markShowOpened(show) {
  const previous = state.episodeActivity[show.url];
  const next = episodeActivity(previous, show.episodes.map(episode => episode.id), true);
  state.episodeActivity[show.url] = next;
  feedCheckAfter.set(show.url, Date.now() + feedCheckInterval);
  return next !== previous;
}

async function refreshFollowedFeeds() {
  if (checkingFollows || document.hidden || !navigator.onLine) return;
  const due = state.follows.filter(show => (feedCheckAfter.get(show.url) ?? 0) <= Date.now());
  if (!due.length) return;
  checkingFollows = true;
  async function refresh() {
    while (due.length && !document.hidden) {
      const follow = due.shift();
      const { url } = follow;
      if (!state.follows.includes(follow) || feedCheckAfter.get(url) > Date.now()) continue;
      const previous = state.episodeActivity[url];
      feedCheckAfter.set(url, Date.now() + feedCheckInterval);
      try {
        const data = await requestSource(url);
        if (!state.follows.includes(follow) || state.episodeActivity[url] !== previous) continue;
        const next = episodeActivity(previous, readEpisodeIds(data.body, data.url));
        if (next !== previous) {
          state.episodeActivity[url] = next;
          save();
          updateEpisodeBadges();
        }
      } catch { /* Keep the last count if the feed cannot be checked. */ }
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(3, due.length) }, refresh)); }
  finally {
    checkingFollows = false;
    refreshFollowedFeeds();
  }
}

async function loadCategory(category, version) {
  state.category = category;
  state.message = '';
  state.loading = !chartCache.has(category.id);
  render();
  if (!state.loading) return;
  try {
    chartCache.set(category.id, await chartShows(category.id));
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
  state.openEpisodeNotes.clear();
  render();
  try {
    const data = await requestSource(url);
    const show = parseFeed(data.body, data.url, url);
    if (show.artwork) coverUrls.set(url, show.artwork);
    if (version === generation) {
      state.show = { ...hint, ...show, artwork: show.artwork || hint.artwork, author: show.author || hint.author };
      if (state.follows.some(item => item.url === url) && markShowOpened(show)) save();
    }
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
  const key = state.current.key;
  const observed = observedPositions.get(key);
  if (observed !== undefined && Math.abs(observed - position) < (force ? 0.1 : 0.75)) return;
  observedPositions.set(key, position);
  state.progress[key] = position;
  if (!native) sync.record('progress', key, position, force);
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
      const resume = state.progress[episode.key];
      const syncResume = !playing && resume !== undefined && Math.abs(resume - position) > 1 ? resume : undefined;
      if (native) await android('toggle', { resume: syncResume, resumeAt: sync.data.progressAt[episode.key] });
      else if (audio.paused) {
        if (syncResume !== undefined) {
          observedPositions.set(episode.key, syncResume);
          audio.currentTime = syncResume;
        }
        await audio.play();
      }
      else audio.pause();
    } else {
      checkpoint(true);
      if (native) {
        await android('load', {
          ...episode, rate: state.rate, resume: state.progress[episode.key], resumeAt: sync.data.progressAt[episode.key]
        });
        state.current = episode;
        activeKey = episode.key;
      } else {
        state.current = episode;
        activeKey = episode.key;
        audio.src = episode.audio;
        audio.playbackRate = state.rate;
        const resume = state.progress[episode.key] ?? 0;
        observedPositions.set(episode.key, resume);
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
    if (native) sync.schedule(500);
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
      play: () => { if (state.current && audio.paused) start(state.current); }, pause: () => audio.pause(),
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
        const wasPlaying = playing;
        activeKey = status.key;
        position = status.position; duration = status.duration; playing = status.playing;
        if (status.error && status.error !== state.playbackError) notice(status.error);
        state.playbackError = status.error;
        if (playing) endedKey = '';
        if (status.ended) await advance();
        else checkpoint();
        if (wasPlaying && !playing) sync.schedule(500);
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
$('#open-sync').onclick = () => { paintSync(); $('#sync-dialog').showModal(); sync.session(); };
$('#close-sync').onclick = () => $('#sync-dialog').close();
$('#sync-form').onsubmit = async event => {
  event.preventDefault();
  const input = $('#sync-password');
  const submit = $('#sign-in');
  submit.disabled = true;
  try {
    await sync.login(input.value);
    input.value = '';
  } catch (error) { $('#sync-status').textContent = error.message; }
  finally { submit.disabled = false; }
};
$('#sync-now').onclick = () => sync.run();
$('#sign-out').onclick = async () => {
  $('#sign-out').disabled = true;
  try { await sync.logout(); }
  catch (error) { $('#sync-status').textContent = error.message; }
  finally { $('#sign-out').disabled = false; }
};
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
window.addEventListener('pagehide', () => {
  if (playing) checkpoint(true);
});
window.addEventListener('popstate', event => showRoute(event.state?.onionPod ?? initialRoute));
if (!history.state?.onionPod) history.replaceState({ onionPod: initialRoute }, '');
showRoute(history.state.onionPod);
player();
refreshFollowedFeeds();
setInterval(refreshFollowedFeeds, feedCheckInterval);
setInterval(refreshExplore, exploreMaxAge);
document.addEventListener('visibilitychange', refreshFollowedFeeds);
window.addEventListener('online', refreshFollowedFeeds);
sync.session();
setInterval(() => sync.schedule(), 15_000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) checkpoint(true);
  else if (!document.hidden) sync.schedule();
});
window.addEventListener('online', () => sync.session());
document.addEventListener('visibilitychange', refreshExplore);
window.addEventListener('online', refreshExplore);
