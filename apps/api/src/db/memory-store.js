import { randomUUID } from 'node:crypto';
import { DEFAULT_TITLE, ZERO_USAGE } from './store.js';

/** @typedef {import('./store.js').Store} Store */
/** @typedef {import('./store.js').Conversation} Conversation */
/** @typedef {import('./store.js').Message} Message */
/** @typedef {import('./store.js').User} User */
/** @typedef {import('./store.js').Usage} Usage */

export { DEFAULT_TITLE };

/**
 * In-memory implementation of the Store contract. Data is lost on restart:
 * used by tests and by `npm run dev` when DATABASE_URL is not set.
 * @param {{ now?: () => Date }} [options]
 * @returns {Store & { moderationEvents: import('./store.js').ModerationEvent[] }}
 */
export function createMemoryStore({ now = () => new Date() } = {}) {
  /** @type {Map<string, User>} keyed by authUid */
  const users = new Map();
  /** @type {Map<string, Conversation>} */
  const conversations = new Map();
  /** @type {Map<string, Message[]>} */
  const messages = new Map();
  /** @type {Map<string, Usage>} keyed by `${userId}|${day}` */
  const usage = new Map();
  /** @type {import('./store.js').ModerationEvent[]} */
  const moderationEvents = [];

  return {
    moderationEvents,

    async upsertUser({ authUid, email = null, displayName = null }) {
      const existing = users.get(authUid);
      const user = existing
        ? { ...existing, email, displayName }
        : { id: randomUUID(), authUid, email, displayName, createdAt: now().toISOString() };
      users.set(authUid, user);
      return { ...user };
    },

    async createConversation({ userId, title }) {
      const timestamp = now().toISOString();
      const conversation = { id: randomUUID(), userId, title: title ?? DEFAULT_TITLE, createdAt: timestamp, updatedAt: timestamp };
      conversations.set(conversation.id, conversation);
      messages.set(conversation.id, []);
      return { ...conversation };
    },

    async listConversations(userId) {
      return [...conversations.values()]
        .filter((c) => c.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((c) => ({ ...c }));
    },

    async getConversation(id, userId) {
      const conversation = conversations.get(id);
      return conversation && conversation.userId === userId ? { ...conversation } : null;
    },

    async updateConversation(id, { title }) {
      const conversation = conversations.get(id);
      if (!conversation) return;
      conversation.title = title;
      conversation.updatedAt = now().toISOString();
    },

    async deleteConversation(id, userId) {
      const conversation = conversations.get(id);
      if (!conversation || conversation.userId !== userId) return false;
      conversations.delete(id);
      messages.delete(id);
      return true;
    },

    async listMessages(conversationId) {
      return (messages.get(conversationId) ?? []).map((m) => ({ ...m }));
    },

    async addMessage(input) {
      const list = messages.get(input.conversationId);
      const conversation = conversations.get(input.conversationId);
      if (!list || !conversation) throw new Error(`Conversation not found: ${input.conversationId}`);
      /** @type {Message} */
      const message = {
        id: input.id ?? randomUUID(),
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        model: input.model ?? null,
        routeReason: input.routeReason ?? null,
        tokensIn: input.tokensIn ?? null,
        tokensOut: input.tokensOut ?? null,
        latencyMs: input.latencyMs ?? null,
        firstTokenMs: input.firstTokenMs ?? null,
        createdAt: now().toISOString(),
      };
      list.push(message);
      conversation.updatedAt = message.createdAt;
      return { ...message };
    },

    async getUsage(userId, day) {
      return { ...(usage.get(`${userId}|${day}`) ?? ZERO_USAGE) };
    },

    async addUsage(userId, day, delta) {
      const key = `${userId}|${day}`;
      const current = usage.get(key) ?? ZERO_USAGE;
      usage.set(key, {
        tokensIn: current.tokensIn + delta.tokensIn,
        tokensOut: current.tokensOut + delta.tokensOut,
        costCents: current.costCents + delta.costCents,
      });
    },

    async getTotalCostCents(fromDay, toDay) {
      let total = 0;
      for (const [key, value] of usage) {
        const day = key.split('|')[1];
        if (day >= fromDay && day <= toDay) total += value.costCents;
      }
      return total;
    },

    async recordModerationEvent(event) {
      moderationEvents.push({ messageId: null, ...event });
    },
  };
}
