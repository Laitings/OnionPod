import { catalog, categories, podcastCategory, directoryShows, chartIds, rankedShows, mergeShows, httpsUrl, parseFeed, readArtwork, readFeedEpisodes, episodeInboxUpdate, inboxNewestFirst, enqueue, episodeFeed, recentProgress, resumeEpisode, time } from './model.js';
import { createSync } from './sync.js';

const $ = selector => document.querySelector(selector);
const native = window.OnionNative;
const audio = native ? null : new Audio();
const key = 'onionpod-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(key)) ?? {}; } catch { saved = {}; }
const state = {
  follows: saved.follows ?? [], queue: saved.queue ?? [], progress: saved.progress ?? {},
  episodeDetails: saved.episodeDetails ?? {}, nativeProgressAt: saved.nativeProgressAt ?? {},
  episodeActivity: saved.episodeActivity ?? {},
  inbox: saved.inbox ?? [],
  favorites: saved.favorites ?? [],
  downloads: saved.downloads ?? [], current: saved.current ?? null, rate: saved.rate ?? 1,
  volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 1,
  muted: Boolean(saved.muted),
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
const episodePlayButtons = new Map();
let playingCard;
let generation = 0;
let noticeTimer;
let nativeId = 0;
let endedKey = '';
let nativeQueueRevision = -1;
let nativeQueueReady;
const resumeLookups = new Map();
const waiting = new Map();
const feedCheckAfter = new Map();
const feedCheckInterval = 5 * 60_000;
let checkingFollows = false;
const chartCache = new Map();
const categoryPageSize = 25;
let loadingMoreCategory = false;
const exploreKey = 'onionpod-explore-v2';
const exploreMaxAge = 60 * 60_000;
let explore = readExploreCache();
let exploreJob = false;
let exploreRetryAfter = 0;
const searchCache = new Map();
const initialRoute = { page: 'discover', depth: 0 };
const tabs = {
  discover: 'Discover', categories: 'Categories', category: 'Categories', show: 'Podcast',
  library: 'Library', favorites: 'Favorites', inbox: 'Inbox', queue: 'Queue', downloads: 'Downloads'
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
  local: () => ({ follows: state.follows, progress: state.progress, episodeDetails: state.episodeDetails }),
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
  $('#volume-control').hidden = true;
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
  const { follows, queue, progress, current, rate, volume, muted, downloads, episodeActivity, episodeDetails, nativeProgressAt, inbox, favorites } = state;
  try {
    localStorage.setItem(key, JSON.stringify({ follows, queue, progress, current, rate, volume, muted, downloads, episodeActivity, episodeDetails, nativeProgressAt, inbox, favorites, syncState: sync.data }));
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
  for (const { type, key, value, at, episode } of changes) {
    if (type === 'follow') {
      const existing = state.follows.some(show => show.url === key);
      if (value === null && existing) {
        state.follows = state.follows.filter(show => show.url !== key);
        delete state.episodeActivity[key];
        feedCheckAfter.delete(key);
        state.inbox = state.inbox.filter(episode => episode.feed !== key);
        libraryChanged = true;
      } else if (value && !existing) {
        state.follows.push(value);
        libraryChanged = true;
      }
    } else if (type === 'progress') {
      if (episode) state.episodeDetails[key] = episode;
      if (at >= (state.nativeProgressAt[key] ?? 0) && state.progress[key] !== value) {
        state.progress[key] = value;
        progressChanged = true;
        if (state.current?.key === key && !playing && !activeKey) {
          position = value;
          player();
        }
      }
    }
  }
  if (libraryChanged || (progressChanged && !playing && ['show', 'queue', 'downloads', 'favorites'].includes(state.page))) render();
  if (state.page === 'discover') paintContinueListening();
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

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

function backButton(label) {
  const control = button(label, goBack, 'back');
  control.prepend(icon('back'));
  return control;
}

function paintRange(slider) {
  const max = Number(slider.max) || 0;
  slider.style.setProperty('--fill', (max ? Number(slider.value) / max * 100 : 0) + '%');
}

function paintEpisodeButton(control, symbol, action, title) {
  control.replaceChildren(icon(symbol));
  control.title = action;
  control.setAttribute('aria-label', action + ' ' + title);
}

function episodeButton(symbol, action, episode, fn) {
  const control = button('', fn, 'outline episode-icon');
  paintEpisodeButton(control, symbol, action, episode.title);
  return control;
}

function paintFavorite(control, selected) {
  control.replaceChildren(icon('heart'));
  control.title = selected ? 'Remove from favorites' : 'Save to favorites';
  control.setAttribute('aria-pressed', String(selected));
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
    state.inbox = state.inbox.filter(episode => episode.feed !== url);
    sync.record('follow', url, null, true);
  } else {
    const { episodes, notesFor, releaseTiming, ...details } = show;
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
  control.replaceChildren(icon(following ? 'check' : 'plus'));
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
  if (route.page === 'library' || route.page === 'inbox') refreshFollowedFeeds();
  if (route.page === 'inbox') refreshInboxPlayback();
  if (route.page === 'discover' && !route.query) refreshExplore();
  window.scrollTo(0, 0);
}

function goBack() {
  if (history.state?.onionPod?.depth > 0) history.back();
}

function episodeWithResume(episode) {
  return { ...episode, resume: state.progress[episode.key], resumeAt: sync.data.progressAt[episode.key] };
}

function applyNativeQueue(snapshot) {
  if (!snapshot || snapshot.revision < 1 || snapshot.revision <= nativeQueueRevision) return false;
  nativeQueueRevision = snapshot.revision;
  state.queue = snapshot.items;
  save();
  return true;
}

function initializeNativeQueue() {
  if (!nativeQueueReady) {
    nativeQueueReady = android('queue', { op: 'initialize', items: state.queue.map(episodeWithResume) })
      .then(snapshot => { if (applyNativeQueue(snapshot)) render(); })
      .catch(error => { nativeQueueReady = undefined; throw error; });
  }
  return nativeQueueReady;
}

async function editQueue(op, episode, index) {
  try {
    if (native) {
      await initializeNativeQueue();
      applyNativeQueue(await android('queue', {
        op, key: episode.key, ...(op === 'add' ? { episode: episodeWithResume(episode) } : {})
      }));
    } else if (op === 'add') {
      state.queue = enqueue(state.queue, episode);
    } else if (op === 'remove') {
      state.queue = state.queue.filter(item => item.key !== episode.key);
    } else if (index > 0 && state.queue[index]?.key === episode.key) {
      [state.queue[index - 1], state.queue[index]] = [state.queue[index], state.queue[index - 1]];
    }
    save();
    render();
    if (op === 'add') notice('Added to your queue.');
  } catch (error) { notice(error.message); }
}

function findResumeEpisode(key) {
  return state.episodeDetails[key] ?? (state.current?.key === key ? resumeEpisode(state.current) : null);
}

function recoverResumeEpisode(key) {
  if ((resumeLookups.get(key) ?? 0) > Date.now()) return;
  resumeLookups.set(key, Date.now() + 60_000);
  const url = episodeFeed(key);
  requestSource(url).then(data => {
    const show = parseFeed(data.body, data.url, url);
    const episode = resumeEpisode(show.episodes.find(item => item.key === key));
    if (!episode) return;
    state.episodeDetails[key] = episode;
    save();
    paintContinueListening();
  }).catch(() => { /* Keep any available local resume option. */ });
}

const continueLimit = 6;

function paintContinueListening() {
  const panel = $('#continue-listening');
  if (!panel) return;
  const candidates = recentProgress(state.progress, sync.data.progressAt, state.current?.key, state.nativeProgressAt);
  if (navigator.onLine) {
    for (const candidate of candidates.slice(0, continueLimit)) {
      if (!findResumeEpisode(candidate.key)) recoverResumeEpisode(candidate.key);
    }
  }
  const items = [];
  for (const candidate of candidates) {
    const episode = findResumeEpisode(candidate.key);
    if (!episode) continue;
    items.push({ episode, position: candidate.position });
    if (items.length >= continueLimit) break;
  }
  panel.hidden = !items.length;
  if (!items.length) {
    delete panel.dataset.episodes;
    return;
  }
  const signature = items.map(item => item.episode.key).join('\n');
  if (panel.dataset.episodes !== signature) {
    for (const cover of panel.querySelectorAll('[data-artwork-feed]')) coverObserver.unobserve(cover);
    panel.dataset.episodes = signature;
    const heading = el('div', 'section-head');
    heading.append(el('h2', '', 'Continue Listening'));
    const list = el('div', 'grid');
    for (const { episode } of items) {
      const wrapper = el('article', 'podcast-card');
      const card = button('', () => openFeed(episode.feed, { title: episode.show, artwork: episode.artwork }), 'card');
      card.append(artwork(episode, 'cover', true), el('strong', '', episode.title), el('small', '', episode.show));
      const actions = el('div', 'card-actions');
      const meta = el('small', 'continue-meta');
      meta.dataset.episode = episode.key;
      const play = button('Resume', () => start(episode), 'primary continue-action');
      play.dataset.episode = episode.key;
      play.setAttribute('aria-label', 'Resume ' + episode.title);
      actions.append(meta, play);
      wrapper.append(card, actions);
      list.append(wrapper);
    }
    panel.replaceChildren(heading, list);
  }
  const positions = new Map(items.map(item => [item.episode.key, item.position]));
  for (const meta of panel.querySelectorAll('.continue-meta')) {
    meta.textContent = time(positions.get(meta.dataset.episode) ?? 0);
  }
  for (const play of panel.querySelectorAll('.continue-action')) {
    const pause = activeKey === play.dataset.episode && playing;
    play.textContent = pause ? 'Pause' : 'Resume';
  }
}

function releaseInfo(timing) {
  if (!timing) return null;
  const line = el('p', 'show-release');
  if (timing.kind === 'scheduled') {
    const date = new Date(timing.at);
    const format = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' });
    const when = el('time', '', format.format(date));
    when.dateTime = date.toISOString();
    line.append(el('strong', '', 'Upcoming'), ' · ', when);
    if (timing.title) line.append(el('small', '', timing.title));
  } else {
    let cadence = timing.cadence === 'daily' ? 'daily' : 'on weekdays';
    if (timing.weekday !== undefined) {
      const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][timing.weekday];
      cadence = timing.cadence === 'weekly' ? 'on ' + day + 's' : 'every other ' + day;
    }
    line.append('Usually releases ' + cadence + ' · ', el('small', '', 'Estimate'));
  }
  return line;
}

function insertList(target, episodes, context) {
  if (!episodes.length) {
    target.append(el('p', 'empty', {
      feed: 'No playable HTTPS audio episodes were found in this feed.',
      inbox: state.follows.length ? 'You’re caught up. New releases from the shows you follow will appear here.' : 'Follow a podcast to get its new episodes here.',
      favorites: 'Tap the heart on an episode to save it here.',
      queue: 'Your queue is empty. Add an episode to line up what plays next.',
      downloads: 'Your downloads will appear here.'
    }[context]));
    return;
  }
  const list = el('div', 'episodes');
  const favoriteKeys = new Set(state.favorites.map(episode => episode.key));
  for (const [index, episode] of episodes.entries()) {
    const row = el('article', 'episode');
    if (state.current?.key === episode.key) row.dataset.active = '';
    const info = el('div', 'episode-info');
    const copy = el('div', 'episode-copy');
    if (context !== 'feed') info.append(artwork(episode, 'mini-cover', true));
    const date = new Date(episode.date);
    const progress = state.progress[episode.key];
    const meta = [context !== 'feed' ? episode.show : '', !Number.isNaN(date.valueOf()) ? date.toLocaleDateString() : '', progress ? 'Resume at ' + time(progress) : ''];
    if (context === 'downloads') meta.push({ pending: 'Downloading', ready: 'Available offline', failed: 'Download failed' }[episode.downloadState] ?? 'Checking download');
    copy.append(el('strong', '', episode.title), el('small', '', meta.filter(Boolean).join(' · ')));
    info.append(copy);
    const actions = el('div', 'actions');
    const isPlaying = playing && activeKey === episode.key;
    const play = episodeButton(isPlaying ? 'pause' : 'play', isPlaying ? 'Pause' : 'Play', episode, () => start(episode));
    episodePlayButtons.set(episode.key, { control: play, title: episode.title });
    if (isPlaying) playingCard = episodePlayButtons.get(episode.key);
    play.classList.add('episode-play');
    actions.append(play);

    const favorite = episodeButton('heart', 'Favorite', episode, () => {
      const selected = favorite.getAttribute('aria-pressed') === 'true';
      if (selected) {
        state.favorites = state.favorites.filter(item => item.key !== episode.key);
      } else {
        const { key, id, feed, audio, title, show, artwork, date } = episode;
        state.favorites = [{ key, id, feed, audio, title, show, artwork, date }, ...state.favorites];
      }
      save();
      if (context === 'favorites' && selected) {
        render();
        const hearts = document.querySelectorAll('.episode-favorite');
        (hearts[Math.min(index, hearts.length - 1)] ?? $('#app-back')).focus();
      } else paintFavorite(favorite, !selected);
    });
    favorite.classList.add('episode-favorite');
    paintFavorite(favorite, favoriteKeys.has(episode.key));
    actions.append(favorite);

    if (context === 'inbox') {
      const dismiss = episodeButton('close', 'Dismiss', episode, () => {
        removeInboxEpisodes([episode.key]);
        const controls = document.querySelectorAll('.inbox-dismiss');
        (controls[Math.min(index, controls.length - 1)] ?? $('[data-page=inbox]')).focus();
      });
      dismiss.classList.add('inbox-dismiss');
      actions.append(dismiss);
    } else if (context === 'queue') {
      const up = episodeButton('up', 'Move up', episode, () => editQueue('move-up', episode, index));
      up.disabled = index === 0;
      actions.append(up, episodeButton('close', 'Remove from queue', episode, () => editQueue('remove', episode)));
    } else if (context !== 'downloads') {
      const queued = state.queue.some(item => item.key === episode.key);
      const add = episodeButton(queued ? 'queued' : 'queue-add', queued ? 'Already queued' : 'Add to queue', episode,
        () => editQueue('add', episode));
      add.disabled = queued;
      actions.append(add);
    }
    if (native && context !== 'inbox') {
      const downloaded = state.downloads.find(item => item.key === episode.key);
      if (context === 'downloads') {
        if (episode.downloadState === 'failed') actions.append(episodeButton('retry', 'Retry download', episode, () => download(episode)));
        actions.append(episodeButton('close', 'Remove download of', episode, () => removeDownload(episode)));
      } else {
        const downloadButton = episodeButton(downloaded ? 'check' : 'downloads', downloaded ? 'Open Downloads for' : 'Download', episode,
          () => downloaded ? navigate({ page: 'downloads' }) : download(episode));
        actions.append(downloadButton);
      }
    }
    row.append(info, actions);
    const notes = context === 'feed' ? state.show.notesFor(episode.key) : '';
    if (notes) {
      const details = el('div', 'episode-notes', notes);
      details.id = 'episode-notes-' + index;
      details.hidden = !state.openEpisodeNotes.has(episode.key);
      const disclosure = episodeButton('notes', 'Show notes for', episode, () => {
        details.hidden = !details.hidden;
        disclosure.setAttribute('aria-expanded', String(!details.hidden));
        if (details.hidden) state.openEpisodeNotes.delete(episode.key);
        else state.openEpisodeNotes.add(episode.key);
      });
      disclosure.setAttribute('aria-expanded', String(!details.hidden));
      disclosure.setAttribute('aria-controls', details.id);
      actions.append(disclosure);
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
  const activeTab = parent === 'category' ? 'categories' : parent === 'favorites' ? 'library' : parent;
  for (const tab of document.querySelectorAll('[data-page]')) {
    const selected = tab.dataset.page === activeTab;
    if (selected) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  $('#queue-count').textContent = state.queue.length || '';
  $('#section-label').textContent = tabs[page];
  const content = $('#content');
  episodePlayButtons.clear();
  playingCard = undefined;
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
    if (!state.query) {
      const resume = el('section', 'section');
      resume.id = 'continue-listening';
      content.append(resume);
      paintContinueListening();
    }
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
    content.append(backButton(state.categoryBackLabel), el('h1', '', category.title));
    if (state.loading || state.message) {
      const status = el('p', 'empty', state.message || 'Loading podcasts…');
      status.setAttribute('role', 'status');
      content.append(status);
      if (state.message) content.append(button('Try again', () => loadCategory(category, ++generation)));
    } else {
      const heading = el('div', 'section-head');
      heading.append(el('h2', '', category.queries ? 'Popular podcasts' : 'Top podcasts'),
        el('small', '', category.queries ? 'Apple Podcasts · Topic' : 'Apple Podcasts · US'));
      const cached = chartCache.get(category.id);
      const shows = cached ? (cached.ids ? cached.shows : cached.shows.slice(0, cached.visible)) : [];
      const hasMore = cached ? (cached.ids ? cached.loaded < cached.ids.length : cached.visible < cached.shows.length) : false;
      content.append(heading, shows.length ? grid(shows) : el('p', 'empty', 'No public HTTPS feeds are available in this category right now.'));
      if (hasMore) {
        const more = button(loadingMoreCategory ? 'Loading more…' : 'Show more podcasts', () => loadMoreCategory(category));
        more.classList.add('more');
        more.disabled = loadingMoreCategory;
        content.append(more);
      }
    }
  } else if (page === 'show') {
    content.append(backButton(state.backLabel));
    if (!state.show) {
      content.append(el('p', 'empty', state.message || 'Loading episodes…'));
      return;
    }
    const show = state.show;
    const intro = el('section', 'show-header');
    const copy = el('div');
    const following = state.follows.some(item => item.url === show.url);
    copy.append(el('h1', '', show.title), el('p', 'meta', show.author || 'Podcast'));
    const timing = releaseInfo(show.releaseTiming);
    if (timing) copy.append(timing);
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
  } else if (page === 'library') {
    const heading = el('div', 'library-heading');
    heading.append(el('h1', '', 'Your library'), button('Favorites', () => navigate({ page: 'favorites' })));
    content.append(heading, state.follows.length ? grid(state.follows) : el('p', 'empty', 'Follow a podcast to find it here.'));
  } else {
    content.append(el('h1', '', { favorites: 'Favorites', inbox: 'New Episodes', queue: 'Up next', downloads: 'Downloads' }[page]));
    if (page === 'favorites') insertList(content, state.favorites, 'favorites');
    else if (page === 'inbox') {
      const now = Date.now();
      insertList(content, inboxNewestFirst(state.inbox.filter(episode => !(Date.parse(episode.date) > now))), 'inbox');
    }
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

async function lookupShows(ids) {
  if (!ids.length) return [];
  const query = new URLSearchParams({ id: ids.join(','), entity: 'podcast', country: 'US' });
  const details = await requestSource('https://itunes.apple.com/lookup?' + query);
  return rankedShows(ids, JSON.parse(details.body).results ?? []);
}

async function chartShows(categoryId) {
  const genre = categoryId ? '/genre=' + categoryId : '';
  const chart = await requestSource('https://itunes.apple.com/us/rss/toppodcasts/limit=25' + genre + '/json');
  return lookupShows(chartIds(JSON.parse(chart.body)));
}

async function chartCategoryPage(categoryId) {
  const chart = await requestSource('https://itunes.apple.com/us/rss/toppodcasts/limit=200/genre=' + categoryId + '/json');
  const ids = chartIds(JSON.parse(chart.body), 200);
  const batch = ids.slice(0, categoryPageSize);
  const shows = await lookupShows(batch);
  return { ids, shows, loaded: batch.length };
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

function observeFollowedEpisodes(url, episodes, opened = false) {
  const previous = state.episodeActivity[url];
  const { activity, added } = episodeInboxUpdate(previous, episodes, opened);
  state.episodeActivity[url] = activity;
  const discoveredAt = Date.now();
  for (const episode of added) {
    if (state.progress[episode.key] > 0 || (playing && activeKey === episode.key)) continue;
    state.inbox.push({ ...episode, discoveredAt });
  }
  return activity !== previous;
}

function removeInboxEpisodes(keys) {
  const remaining = state.inbox.filter(episode => !keys.includes(episode.key));
  if (remaining.length === state.inbox.length) return;
  state.inbox = remaining;
  save();
  if (state.page === 'inbox') render();
}

async function refreshInboxPlayback() {
  if (!native || !state.inbox.length) return;
  try {
    const played = await android('played-episodes', { keys: state.inbox.map(episode => episode.key) });
    removeInboxEpisodes(played);
  } catch { /* The next playback check can retry. */ }
}

function markShowOpened(show) {
  feedCheckAfter.set(show.url, Date.now() + feedCheckInterval);
  return observeFollowedEpisodes(show.url, show.episodes, true);
}

async function refreshFollowedFeeds() {
  if (checkingFollows || document.hidden || !navigator.onLine) return;
  const due = state.follows.filter(show => (feedCheckAfter.get(show.url) ?? 0) <= Date.now());
  if (!due.length) return;
  checkingFollows = true;
  let inboxChanged = false;
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
        const length = state.inbox.length;
        if (observeFollowedEpisodes(url, readFeedEpisodes(data.body, data.url, url))) {
          inboxChanged ||= state.inbox.length !== length;
          save();
          updateEpisodeBadges();
        }
      } catch { /* Keep the last count if the feed cannot be checked. */ }
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(3, due.length) }, refresh)); }
  finally {
    checkingFollows = false;
    if (state.page === 'inbox' && inboxChanged) {
      render();
      refreshInboxPlayback();
    }
    refreshFollowedFeeds();
  }
}

async function searchDirectory(query, limit = 18) {
  const params = new URLSearchParams({ term: query, media: 'podcast', limit: String(limit) });
  const endpoint = '/api/search?q=' + encodeURIComponent(query) + (limit !== 18 ? '&limit=' + limit : '');
  const { body } = await request(endpoint, 'https://itunes.apple.com/search?' + params);
  return directoryShows(JSON.parse(body).results ?? []);
}

async function topicShows(queries) {
  const lists = await Promise.all(queries.map(query => searchDirectory(query, 100)));
  return { shows: mergeShows(lists, 200), visible: categoryPageSize };
}

async function loadCategory(category, version) {
  state.category = category;
  state.message = '';
  loadingMoreCategory = false;
  state.loading = !chartCache.has(category.id);
  render();
  if (!state.loading) return;
  try {
    chartCache.set(category.id, category.queries ? await topicShows(category.queries) : await chartCategoryPage(category.id));
  } catch {
    if (version === generation) state.message = 'This category could not load. Try again in a moment.';
  } finally {
    if (version === generation) { state.loading = false; render(); }
  }
}

async function loadMoreCategory(category) {
  const cached = chartCache.get(category.id);
  if (!cached || loadingMoreCategory) return;
  if (!cached.ids) {
    cached.visible = Math.min(cached.shows.length, cached.visible + categoryPageSize);
    render();
    return;
  }
  if (cached.loaded >= cached.ids.length) return;
  const version = generation;
  loadingMoreCategory = true;
  render();
  try {
    const batch = cached.ids.slice(cached.loaded, cached.loaded + categoryPageSize);
    const next = await lookupShows(batch);
    const seen = new Set(cached.shows.map(show => show.url));
    for (const show of next) {
      if (!seen.has(show.url)) { seen.add(show.url); cached.shows.push(show); }
    }
    cached.loaded += batch.length;
  } catch {
    if (version === generation) notice('Could not load more podcasts. Try again in a moment.');
  } finally {
    loadingMoreCategory = false;
    if (version === generation && state.page === 'category' && state.category?.id === category.id) render();
  }
}

async function loadSearch(query, version) {
  state.query = query;
  state.loading = !searchCache.has(query);
  state.results = searchCache.get(query) ?? [];
  render();
  if (!state.loading) return;
  try {
    const shows = await searchDirectory(query);
    if (version !== generation) return;
    state.results = shows;
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
  const episode = resumeEpisode(state.current);
  if (episode) state.episodeDetails[key] = episode;
  if (!native) sync.record('progress', key, position, force, episode);
  lastCheckpoint = Date.now();
  save();
  paintContinueListening();
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
  $('#toggle').replaceChildren(icon(playing ? 'pause' : 'play'));
  $('#toggle').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('#toggle').disabled = !current;
  $('#rewind').disabled = $('#forward').disabled = $('#seek').disabled = !duration;
  $('#elapsed').textContent = time(position);
  $('#duration').textContent = time(duration);
  $('#seek').max = Math.floor(duration) || 0;
  if (!$('#seek').matches(':active')) $('#seek').value = Math.floor(position);
  paintRange($('#seek'));
  $('#seek').setAttribute('aria-valuetext', time(position));
  const episodeCard = playing ? episodePlayButtons.get(activeKey) : undefined;
  if (episodeCard !== playingCard) {
    if (playingCard) paintEpisodeButton(playingCard.control, 'play', 'Play', playingCard.title);
    if (episodeCard) paintEpisodeButton(episodeCard.control, 'pause', 'Pause', episodeCard.title);
    playingCard = episodeCard;
  }
  for (const quickResume of document.querySelectorAll('#continue-listening .continue-action')) {
    quickResume.textContent = playing && quickResume.dataset.episode === activeKey ? 'Pause' : 'Resume';
  }
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
        await initializeNativeQueue();
        applyNativeQueue(await android('load', { ...episodeWithResume(episode), rate: state.rate }));
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
      if (!native && !fromQueue && state.queue.some(item => item.key === episode.key)) {
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
  audio.addEventListener('playing', () => removeInboxEpisodes([activeKey]));
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
    if (polling || busy) return;
    polling = true;
    try {
      const status = await android('status', { queueRevision: nativeQueueRevision, previousKey: state.current?.key });
      if (busy) return;
      const queueChanged = applyNativeQueue(status.queue);
      const switched = status.episode && status.key !== state.current?.key;
      if (switched) {
        if (state.current && status.previousPosition !== undefined) {
          state.progress[state.current.key] = status.previousPosition;
        }
        state.current = status.episode;
        activeKey = status.key;
        save();
      }
      if (status.key && status.key === state.current?.key) {
        const wasPlaying = playing;
        activeKey = status.key;
        position = status.ended ? 0 : status.position; duration = status.duration; playing = status.playing;
        if (status.at > (state.nativeProgressAt[status.key] ?? 0)) state.nativeProgressAt[status.key] = status.at;
        if (status.error && status.error !== state.playbackError) notice(status.error);
        state.playbackError = status.error;
        checkpoint(status.ended);
        if (status.started) removeInboxEpisodes([status.key]);
        if (wasPlaying && !playing) sync.schedule(500);
        player();
      }
      if (queueChanged || switched) render();
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
$('#seek').oninput = event => paintRange(event.target);
function applyVolume(persist = false) {
  const level = Math.max(0, Math.min(1, Math.round(state.volume * 100) / 100));
  state.volume = level;
  const silent = state.muted || level === 0;
  if (audio) {
    audio.volume = level;
    audio.muted = state.muted;
  }
  const slider = $('#volume');
  const muteButton = $('#mute');
  if (slider) {
    slider.value = String(silent ? 0 : level);
    paintRange(slider);
    slider.setAttribute('aria-valuetext', silent ? 'Muted' : Math.round(level * 100) + '%');
  }
  if (muteButton) {
    muteButton.replaceChildren(icon(silent ? 'muted' : level < 0.5 ? 'volume-low' : 'volume'));
    muteButton.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
    muteButton.setAttribute('aria-pressed', String(silent));
    muteButton.title = silent ? 'Unmute' : 'Mute';
  }
  if (persist) save();
}
if (!native) {
  applyVolume();
  $('#volume').addEventListener('input', event => {
    const next = Number(event.target.value);
    state.volume = next;
    state.muted = next === 0;
    applyVolume(true);
  });
  $('#mute').addEventListener('click', () => {
    if (state.muted || state.volume === 0) {
      state.muted = false;
      if (state.volume === 0) state.volume = 0.5;
    } else {
      state.muted = true;
    }
    applyVolume(true);
  });
  $('#volume-control').addEventListener('wheel', event => {
    if (!event.deltaY) return;
    event.preventDefault();
    const step = event.deltaY < 0 ? 0.05 : -0.05;
    const base = state.muted ? 0 : state.volume;
    const next = Math.max(0, Math.min(1, Math.round((base + step) * 100) / 100));
    state.volume = next;
    state.muted = next === 0;
    applyVolume(true);
  }, { passive: false });
}
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
if (native) initializeNativeQueue().catch(() => {});
refreshFollowedFeeds();
setInterval(refreshFollowedFeeds, feedCheckInterval);
setInterval(refreshExplore, exploreMaxAge);
document.addEventListener('visibilitychange', refreshFollowedFeeds);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.page === 'inbox') refreshInboxPlayback();
});
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
