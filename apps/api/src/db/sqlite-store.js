import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_TITLE } from './store.js';

/** @typedef {import('./store.js').Store} Store */

/**
 * Schema of the local database (desktop app). Same tables and columns as the PostgreSQL
 * migrations, adapted to SQLite: ids are UUID strings, timestamps are ISO-8601 strings.
 * `PRAGMA user_version` tells which version a database file is at, so future changes
 * can be applied in order (like the SQL migrations of the server).
 */
const MIGRATIONS = [
  `CREATE TABLE users (
     id           TEXT PRIMARY KEY,
     auth_uid     TEXT NOT NULL UNIQUE,
     email        TEXT,
     display_name TEXT,
     created_at   TEXT NOT NULL,
     deleted_at   TEXT
   );
   CREATE TABLE conversations (
     id         TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX conversations_user_updated_idx ON conversations (user_id, updated_at DESC);
   CREATE TABLE messages (
     id              TEXT PRIMARY KEY,
     conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
     role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
     content         TEXT NOT NULL,
     model           TEXT,
     route_reason    TEXT,
     tokens_in       INTEGER CHECK (tokens_in >= 0),
     tokens_out      INTEGER CHECK (tokens_out >= 0),
     latency_ms      INTEGER CHECK (latency_ms >= 0),
     first_token_ms  INTEGER CHECK (first_token_ms >= 0),
     created_at      TEXT NOT NULL
   );
   CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at);
   CREATE TABLE usage_daily (
     user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     day        TEXT NOT NULL,
     tokens_in  INTEGER NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
     tokens_out INTEGER NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
     cost_cents REAL NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
     PRIMARY KEY (user_id, day)
   );
   CREATE TABLE moderation_events (
     id         TEXT PRIMARY KEY,
     user_id    TEXT REFERENCES users (id) ON DELETE CASCADE,
     message_id TEXT REFERENCES messages (id) ON DELETE SET NULL,
     direction  TEXT NOT NULL CHECK (direction IN ('in', 'out')),
     category   TEXT NOT NULL,
     action     TEXT NOT NULL,
     created_at TEXT NOT NULL
   );`,
];

/** @param {any} row @returns {import('./store.js').User} */
const toUser = (row) => ({
  id: row.id,
  authUid: row.auth_uid,
  email: row.email,
  displayName: row.display_name,
  createdAt: row.created_at,
});

/** @param {any} row @returns {import('./store.js').Conversation} */
const toConversation = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** @param {any} row @returns {import('./store.js').Message} */
const toMessage = (row) => ({
  id: row.id,
  conversationId: row.conversation_id,
  role: row.role,
  content: row.content,
  model: row.model,
  routeReason: row.route_reason,
  tokensIn: row.tokens_in,
  tokensOut: row.tokens_out,
  latencyMs: row.latency_ms,
  firstTokenMs: row.first_token_ms,
  createdAt: row.created_at,
});

/**
 * Opens (or creates) a SQLite database file and brings its schema up to date.
 * Uses `node:sqlite`, built into Node.js: no extra dependency and no server to install.
 * @param {string} file  Path to the .db file, or ':memory:' (tests).
 */
export function openSqliteDatabase(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;'); // safer against crashes, faster writes
  const { user_version: version } = /** @type {{ user_version: number }} */ (db.prepare('PRAGMA user_version').get());
  for (let i = version; i < MIGRATIONS.length; i += 1) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

/**
 * SQLite implementation of the Store contract, for the desktop app (one user, one file).
 * Every query uses parameters (?): values never get concatenated into SQL.
 * @param {DatabaseSync} db  From openSqliteDatabase().
 * @param {{ now?: () => Date }} [options]
 * @returns {Store & { close: () => void }}
 */
export function createSqliteStore(db, { now = () => new Date() } = {}) {
  const timestamp = () => now().toISOString();
  const statements = {
    userByAuthUid: db.prepare('SELECT * FROM users WHERE auth_uid = ?'),
    insertUser: db.prepare('INSERT INTO users (id, auth_uid, email, display_name, created_at) VALUES (?, ?, ?, ?, ?)'),
    updateUser: db.prepare('UPDATE users SET email = ?, display_name = ? WHERE auth_uid = ?'),
    insertConversation: db.prepare('INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'),
    listConversations: db.prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 200'),
    getConversation: db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?'),
    renameConversation: db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?'),
    touchConversation: db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?'),
    deleteConversation: db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?'),
    listMessages: db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid'),
    insertMessage: db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, model, route_reason,
                             tokens_in, tokens_out, latency_ms, first_token_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ),
    getUsage: db.prepare('SELECT tokens_in, tokens_out, cost_cents FROM usage_daily WHERE user_id = ? AND day = ?'),
    addUsage: db.prepare(
      `INSERT INTO usage_daily (user_id, day, tokens_in, tokens_out, cost_cents) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET
         tokens_in  = tokens_in  + excluded.tokens_in,
         tokens_out = tokens_out + excluded.tokens_out,
         cost_cents = cost_cents + excluded.cost_cents`,
    ),
    totalCost: db.prepare('SELECT COALESCE(SUM(cost_cents), 0) AS total FROM usage_daily WHERE day BETWEEN ? AND ?'),
    insertModerationEvent: db.prepare(
      'INSERT INTO moderation_events (id, user_id, message_id, direction, category, action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
  };

  /** Runs `fn` inside a transaction (all or nothing). @template T @param {() => T} fn @returns {T} */
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  return {
    async upsertUser({ authUid, email = null, displayName = null }) {
      return transaction(() => {
        if (statements.userByAuthUid.get(authUid)) statements.updateUser.run(email, displayName, authUid);
        else statements.insertUser.run(randomUUID(), authUid, email, displayName, timestamp());
        return toUser(statements.userByAuthUid.get(authUid));
      });
    },

    async createConversation({ userId, title }) {
      const id = randomUUID();
      const at = timestamp();
      statements.insertConversation.run(id, userId, title ?? DEFAULT_TITLE, at, at);
      return { id, userId, title: title ?? DEFAULT_TITLE, createdAt: at, updatedAt: at };
    },

    async listConversations(userId) {
      return statements.listConversations.all(userId).map(toConversation);
    },

    async getConversation(id, userId) {
      const row = statements.getConversation.get(id, userId);
      return row ? toConversation(row) : null;
    },

    async updateConversation(id, { title }) {
      statements.renameConversation.run(title, timestamp(), id);
    },

    async deleteConversation(id, userId) {
      // Messages go away too (ON DELETE CASCADE).
      return Number(statements.deleteConversation.run(id, userId).changes) === 1;
    },

    async listMessages(conversationId) {
      return statements.listMessages.all(conversationId).map(toMessage);
    },

    async addMessage(input) {
      return transaction(() => {
        const at = timestamp();
        const row = statements.insertMessage.get(
          input.id ?? randomUUID(),
          input.conversationId,
          input.role,
          input.content,
          input.model ?? null,
          input.routeReason ?? null,
          input.tokensIn ?? null,
          input.tokensOut ?? null,
          input.latencyMs ?? null,
          input.firstTokenMs ?? null,
          at,
        );
        statements.touchConversation.run(at, input.conversationId);
        return toMessage(row);
      });
    },

    async getUsage(userId, day) {
      const row = /** @type {any} */ (statements.getUsage.get(userId, day));
      return row
        ? { tokensIn: row.tokens_in, tokensOut: row.tokens_out, costCents: Number(row.cost_cents) }
        : { tokensIn: 0, tokensOut: 0, costCents: 0 };
    },

    async addUsage(userId, day, delta) {
      statements.addUsage.run(userId, day, delta.tokensIn, delta.tokensOut, delta.costCents);
    },

    async getTotalCostCents(fromDay, toDay) {
      return Number(/** @type {any} */ (statements.totalCost.get(fromDay, toDay)).total);
    },

    async recordModerationEvent({ userId, messageId = null, direction, category, action }) {
      statements.insertModerationEvent.run(randomUUID(), userId, messageId, direction, category, action, timestamp());
    },

    close() {
      if (db.isOpen) db.close();
    },
  };
}
