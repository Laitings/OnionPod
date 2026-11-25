import { episodeFeed, httpsUrl, resumeEpisode } from './model.js';

const recordId = ({ type, key }) => JSON.stringify([type, key]);

function recordValue(type, key, value) {
  if (typeof key !== 'string' || !key || key.length > 4096) return undefined;
  if (type === 'progress') {
    return episodeFeed(key) && Number.isFinite(value) && value >= 0 && value <= 604800 ? value : undefined;
  }
  if (key.length > 2048 || httpsUrl(key) !== key) return undefined;
  return value === null ? null : {
    url: key, title: value.title?.slice(0, 300), author: value.author?.slice(0, 200),
    artwork: value.artwork?.slice(0, 2048), category: value.category?.slice(0, 100), categoryId: value.categoryId
  };
}

export function createSync({ saved, call, persist, local, collect, apply, paint }) {
  const data = {
    cursor: saved?.cursor ?? 0, initialized: Boolean(saved?.initialized),
    signedIn: Boolean(saved?.signedIn), pending: saved?.pending ?? {}, progressAt: saved?.progressAt ?? {}
  };
  let enabled = null;
  let relayRequiresLogin = null;
  let message = '';
  let busy;
  let timer;
  let deadline = 0;
  let lastTimestamp = 0;
  let authVersion = 0;

  function store(type, key, value, at, episode) {
    value = recordValue(type, key, value);
    if (value === undefined) return;
    const change = { type, key, value, at };
    const details = resumeEpisode(episode, key);
    if (type === 'progress' && details) change.episode = details;
    const id = recordId(change);
    const previous = data.pending[id];
    if (!previous || at >= previous.at) data.pending[id] = change;
    if (type === 'progress') data.progressAt[key] = Math.max(data.progressAt[key] ?? 0, at);
  }

  function record(type, key, value, urgent = false, episode) {
    const last = type === 'progress' ? data.progressAt[key] ?? 0 : 0;
    lastTimestamp = Math.max(Date.now(), lastTimestamp + 1, last + 1);
    store(type, key, value, lastTimestamp, episode);
    schedule(urgent ? 300 : 3000);
  }

  function ingest(progress) {
    for (const { key, at, position, episode } of progress) {
      if (at <= (data.progressAt[key] ?? -1)) continue;
      apply([{ type: 'progress', key, value: position, at, episode }]);
      store('progress', key, position, at, episode);
    }
  }

  async function session() {
    const version = ++authVersion;
    try {
      const result = await call('session');
      if (version !== authVersion) return;
      enabled = result.enabled;
      relayRequiresLogin = Boolean(result.relayRequiresLogin);
      data.signedIn = result.signedIn;
      message = '';
      persist();
      if (data.signedIn) schedule(0);
    } catch {
      if (version !== authVersion) return;
      message = 'Server unavailable. Changes stay on this device.';
    }
    paint();
  }

  async function login(password) {
    ++authVersion;
    await call('login', { password });
    enabled = true;
    data.signedIn = true;
    message = '';
    persist();
    paint();
    schedule(0);
  }

  async function logout() {
    ++authVersion;
    clearTimeout(timer);
    deadline = 0;
    if (busy) await busy;
    try { await call('logout', {}); }
    catch (error) { if (error.status !== 401) throw error; }
    data.signedIn = false;
    message = '';
    persist();
    paint();
  }

  function schedule(delay = 0) {
    if (!data.signedIn || document.hidden) return;
    const next = Date.now() + delay;
    if (deadline && deadline <= next) return;
    clearTimeout(timer);
    deadline = next;
    timer = setTimeout(() => { deadline = 0; exchange(); }, delay);
  }

  function exchange() {
    if (!data.signedIn || document.hidden) return;
    if (!busy) busy = runExchange().finally(() => { busy = undefined; });
    return busy;
  }

  async function runExchange() {
    try {
      await collect?.(ingest);
      if (!data.initialized) {
        const { follows, progress, episodeDetails } = local();
        for (const show of follows) store('follow', show.url, show, 0);
        for (const [key, position] of Object.entries(progress)) store('progress', key, position, 0, episodeDetails?.[key]);
        data.initialized = true;
        persist();
      }
      for (let page = 0; page < 15; page++) {
        const sent = Object.values(data.pending).slice(0, 50);
        const result = await call('exchange', { cursor: data.cursor, changes: sent });
        for (const change of sent) {
          const id = recordId(change);
          if (data.pending[id] === change) delete data.pending[id];
        }
        const changes = new Map(result.changes.map(change => [recordId(change), change]));
        for (const change of result.accepted) changes.set(recordId(change), change);
        const applicable = [...changes.values()].filter(change => !data.pending[recordId(change)]);
        for (const change of applicable) {
          if (change.type === 'progress') data.progressAt[change.key] = change.at;
        }
        data.cursor = result.cursor;
        apply(applicable);
        persist();
        if (!result.more && !Object.keys(data.pending).length) break;
        if (page === 14) schedule(1000);
      }
      message = '';
    } catch (error) {
      if (error.status === 401) {
        data.signedIn = false;
        message = 'Sign in again to sync. Changes stay on this device.';
        persist();
      } else {
        message = error.status === 400 ? error.message : 'Sync paused. Changes stay on this device.';
      }
    }
    paint();
  }

  return { data, session, login, logout, record, run: exchange, schedule, status: () => ({ enabled, relayRequiresLogin, message }) };
}
