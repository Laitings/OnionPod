import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { episodeFeed, httpsUrl, inboxEpisode, queueItems, queueLimit, resumeEpisode } from './web/model.js';

const derive = promisify(scrypt);
const sessionAge = 90 * 24 * 60 * 60;
const hashToken = token => createHash('sha256').update(token).digest('hex');

export class SyncStore {
  constructor(directory) {
    if (directory !== ':memory:') mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(directory === ':memory:' ? directory : join(directory, 'onionpod.sqlite3'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY CHECK (id = 1), salt TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO counter VALUES (1, 0);
      CREATE TABLE IF NOT EXISTS sync_state (
        type TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, at INTEGER NOT NULL,
        revision INTEGER NOT NULL UNIQUE, episode TEXT, PRIMARY KEY (type, key)
      );
    `);
    if (!this.db.prepare('PRAGMA table_info(sync_state)').all().some(column => column.name === 'episode')) {
      this.db.exec('ALTER TABLE sync_state ADD COLUMN episode TEXT');
    }
    this.account = this.db.prepare('SELECT salt, hash FROM account WHERE id = 1');
    this.readSession = this.db.prepare('SELECT expires FROM sessions WHERE digest = ?');
    this.dropSession = this.db.prepare('DELETE FROM sessions WHERE digest = ?');
    this.record = this.db.prepare('SELECT type, key, value, at, episode FROM sync_state WHERE type = ? AND key = ?');
    this.recordsAfter = this.db.prepare('SELECT type, key, value, at, episode, revision FROM sync_state WHERE revision > ? ORDER BY revision LIMIT 201');
    this.maxRevision = this.db.prepare('SELECT revision FROM counter WHERE id = 1');
    this.bump = this.db.prepare('UPDATE counter SET revision = revision + 1 WHERE id = 1 RETURNING revision');
    this.write = this.db.prepare(`INSERT INTO sync_state(type, key, value, at, revision, episode) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(type, key) DO UPDATE SET value = excluded.value, at = excluded.at,
      revision = excluded.revision, episode = excluded.episode`);
  }

  isReady() { return Boolean(this.account.get()); }

  async setPassword(password, rotate = false) {
    if (this.isReady() && !rotate) throw new Error('An account already exists. Use --rotate to replace its password and revoke its sessions.');
    const salt = randomBytes(16).toString('hex');
    const hash = (await derive(password, salt, 64)).toString('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.isReady() && !rotate) throw new Error('An account already exists.');
      this.db.prepare('INSERT OR REPLACE INTO account VALUES (1, ?, ?)').run(salt, hash);
      this.db.exec('DELETE FROM sessions; COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async signIn(password) {
    const account = this.account.get();
    if (!account || typeof password !== 'string' || password.length < 1 || password.length > 256) return '';
    const hash = await derive(password, account.salt, 64);
    if (!timingSafeEqual(hash, Buffer.from(account.hash, 'hex')) || this.account.get()?.hash !== account.hash) return '';
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
    this.db.prepare('INSERT INTO sessions VALUES (?, ?)').run(hashToken(token), Date.now() + sessionAge * 1000);
    return token;
  }

  authorized(token) {
    return /^[A-Za-z0-9_-]{43}$/.test(token) && (this.readSession.get(hashToken(token))?.expires ?? 0) > Date.now();
  }

  signOut(token) { this.dropSession.run(hashToken(token)); }

  exchange(cursor, changes, pushOnly = false) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const accepted = changes.map(change => {
        const old = this.record.get(change.type, change.key);
        const preferLegacyProgress = old?.at === 0 && change.at === 0 && change.type === 'progress'
          && change.value > JSON.parse(old.value);
        if (!old || change.at > old.at || preferLegacyProgress) {
          const episode = change.episode ? JSON.stringify(change.episode) : old?.episode ?? null;
          this.write.run(change.type, change.key, JSON.stringify(change.value), change.at, this.bump.get().revision, episode);
          return episode ? { ...change, episode: JSON.parse(episode) } : change;
        }
        if (change.episode && !old.episode) {
          this.write.run(old.type, old.key, old.value, old.at, this.bump.get().revision, JSON.stringify(change.episode));
          return { ...decode(old), episode: change.episode };
        }
        return decode(old);
      });
      if (pushOnly) {
        this.db.exec('COMMIT');
        return { accepted };
      }
      const latest = this.maxRevision.get().revision;
      const reset = cursor > latest;
      const page = this.recordsAfter.all(reset ? 0 : cursor);
      const more = page.length > 200;
      if (more) page.pop();
      this.db.exec('COMMIT');
      return { accepted, changes: page.map(decode), cursor: page.at(-1)?.revision ?? (reset ? 0 : cursor), more };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close() { this.db.close(); }
}

function decode(row) {
  const change = { type: row.type, key: row.key, at: row.at, value: JSON.parse(row.value) };
  return row.episode ? { ...change, episode: JSON.parse(row.episode) } : change;
}

function title(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export function validateExchange(body) {
  const { cursor, changes, pushOnly = false } = body ?? {};
  if (typeof pushOnly !== 'boolean' || !Number.isSafeInteger(cursor) || cursor < 0 ||
      !Array.isArray(changes) || changes.length > 50) {
    throw new Error('Invalid sync batch.');
  }
  const limit = Date.now() + 5 * 60_000;
  return { cursor, pushOnly, changes: changes.map(change => {
    const { type, key, value, at } = change ?? {};
    if (typeof key !== 'string' || key.length < 1 || key.length > 4096 ||
        !Number.isSafeInteger(at) || at < 0 || at > limit) throw new Error('Invalid sync update or device clock.');
    if (type === 'progress' && Number.isFinite(value) && value >= 0 && value <= 7 * 24 * 3600) {
      if (episodeFeed(key)) {
        const episode = resumeEpisode(change.episode, key);
        return episode ? { type, key, value, at, episode } : { type, key, value, at };
      }
    }
    if (type === 'queue' && key === 'queue' && Array.isArray(value) && value.length <= queueLimit) {
      const items = queueItems(value);
      if (items.length === value.length) return { type, key, value: items, at };
    }
    if (type === 'inbox' && episodeFeed(key)) {
      if (value === null) return { type, key, value, at };
      const item = inboxEpisode(value, key);
      if (item) return { type, key, value: item, at };
    }
    if (type === 'dismiss' && value === true && episodeFeed(key)) return { type, key, value, at };
    if (type === 'follow' && key.length <= 2048 && httpsUrl(key) === key) {
      if (value === null) return { type, key, value, at };
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const categoryId = value.categoryId;
        return { type, key, at, value: {
          url: key, title: title(value.title, 300) || 'Untitled podcast',
          author: title(value.author, 200), artwork: httpsUrl(title(value.artwork, 2048)),
          ...(typeof value.category === 'string' && value.category ? { category: title(value.category, 100) } : {}),
          ...(Number.isInteger(categoryId) && categoryId >= 1300 && categoryId < 2000 ? { categoryId } : {})
        } };
      }
    }
    throw new Error('Invalid sync update.');
  }) };
}

export function sessionCookie(token, secure) {
  return 'onionpod_session=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' +
    (token ? sessionAge : 0) + (secure ? '; Secure' : '');
}
