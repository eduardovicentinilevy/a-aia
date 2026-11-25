import { DEFAULT_TITLE } from './store.js';

/** @typedef {import('./store.js').Store} Store */

/** @param {Date|string|null} value */
const iso = (value) => (value instanceof Date ? value.toISOString() : value);

/** @param {any} row @returns {import('./store.js').User} */
const toUser = (row) => ({
  id: row.id,
  authUid: row.auth_uid,
  email: row.email,
  displayName: row.display_name,
  createdAt: iso(row.created_at),
});

/** @param {any} row @returns {import('./store.js').Conversation} */
const toConversation = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
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
  createdAt: iso(row.created_at),
});

/**
 * PostgreSQL implementation of the Store contract.
 * Every query uses parameters ($1, $2...): values never get concatenated into SQL,
 * which is what prevents SQL injection.
 * @param {import('pg').Pool} pool
 * @returns {Store}
 */
export function createPostgresStore(pool) {
  return {
    async upsertUser({ authUid, email = null, displayName = null }) {
      const { rows } = await pool.query(
        `INSERT INTO users (auth_uid, email, display_name) VALUES ($1, $2, $3)
         ON CONFLICT (auth_uid) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name
         RETURNING *`,
        [authUid, email, displayName],
      );
      return toUser(rows[0]);
    },

    async createConversation({ userId, title }) {
      const { rows } = await pool.query('INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *', [
        userId,
        title ?? DEFAULT_TITLE,
      ]);
      return toConversation(rows[0]);
    },

    async listConversations(userId) {
      const { rows } = await pool.query(
        'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 200',
        [userId],
      );
      return rows.map(toConversation);
    },

    async getConversation(id, userId) {
      const { rows } = await pool.query('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
      return rows[0] ? toConversation(rows[0]) : null;
    },

    async updateConversation(id, { title }) {
      await pool.query('UPDATE conversations SET title = $2, updated_at = now() WHERE id = $1', [id, title]);
    },

    async deleteConversation(id, userId) {
      // Messages go away too (ON DELETE CASCADE).
      const { rowCount } = await pool.query('DELETE FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
      return rowCount === 1;
    },

    async listMessages(conversationId) {
      const { rows } = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at, id', [
        conversationId,
      ]);
      return rows.map(toMessage);
    },

    async addMessage(input) {
      // One statement: insert the message and bump the conversation's updated_at.
      const { rows } = await pool.query(
        `WITH inserted AS (
           INSERT INTO messages (id, conversation_id, role, content, model, route_reason,
                                 tokens_in, tokens_out, latency_ms, first_token_ms)
           VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *
         ), touched AS (
           UPDATE conversations c SET updated_at = i.created_at FROM inserted i WHERE c.id = i.conversation_id
         )
         SELECT * FROM inserted`,
        [
          input.id ?? null,
          input.conversationId,
          input.role,
          input.content,
          input.model ?? null,
          input.routeReason ?? null,
          input.tokensIn ?? null,
          input.tokensOut ?? null,
          input.latencyMs ?? null,
          input.firstTokenMs ?? null,
        ],
      );
      return toMessage(rows[0]);
    },

    async getUsage(userId, day) {
      const { rows } = await pool.query(
        'SELECT tokens_in, tokens_out, cost_cents FROM usage_daily WHERE user_id = $1 AND day = $2',
        [userId, day],
      );
      const row = rows[0];
      return row
        ? { tokensIn: row.tokens_in, tokensOut: row.tokens_out, costCents: Number(row.cost_cents) }
        : { tokensIn: 0, tokensOut: 0, costCents: 0 };
    },

    async addUsage(userId, day, delta) {
      // "Upsert": first message of the day inserts the row, the next ones add to it.
      await pool.query(
        `INSERT INTO usage_daily (user_id, day, tokens_in, tokens_out, cost_cents) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, day) DO UPDATE SET
           tokens_in  = usage_daily.tokens_in  + EXCLUDED.tokens_in,
           tokens_out = usage_daily.tokens_out + EXCLUDED.tokens_out,
           cost_cents = usage_daily.cost_cents + EXCLUDED.cost_cents`,
        [userId, day, delta.tokensIn, delta.tokensOut, delta.costCents],
      );
    },

    async getTotalCostCents(fromDay, toDay) {
      const { rows } = await pool.query(
        'SELECT COALESCE(SUM(cost_cents), 0) AS total FROM usage_daily WHERE day BETWEEN $1 AND $2',
        [fromDay, toDay],
      );
      return Number(rows[0].total);
    },

    async recordModerationEvent({ userId, messageId = null, direction, category, action }) {
      await pool.query(
        'INSERT INTO moderation_events (user_id, message_id, direction, category, action) VALUES ($1, $2, $3, $4, $5)',
        [userId, messageId, direction, category, action],
      );
    },
  };
}
