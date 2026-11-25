import { randomUUID } from 'node:crypto';

/**
 * In-memory conversation store — Phase 0 only (data is lost on restart).
 * Phase 1 adds a PostgreSQL store with the SAME async interface, so routes and
 * the orchestrator do not change.
 *
 * @typedef {object} Conversation
 * @property {string} id
 * @property {string} userId
 * @property {string} title
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {object} Message
 * @property {string} id
 * @property {string} conversationId
 * @property {'user'|'assistant'|'system'} role
 * @property {string} content
 * @property {string|null} model
 * @property {string|null} routeReason
 * @property {number|null} tokensIn
 * @property {number|null} tokensOut
 * @property {number|null} latencyMs
 * @property {number|null} firstTokenMs
 * @property {string} createdAt
 *
 * @typedef {Pick<Message, 'conversationId'|'role'|'content'> & Partial<Omit<Message, 'conversationId'|'role'|'content'|'createdAt'>>} NewMessage
 *
 * @typedef {object} ConversationStore
 * @property {(input: { userId: string, title?: string }) => Promise<Conversation>} createConversation
 * @property {(userId: string) => Promise<Conversation[]>} listConversations
 * @property {(id: string, userId: string) => Promise<Conversation|null>} getConversation
 * @property {(id: string, changes: { title: string }) => Promise<void>} updateConversation
 * @property {(conversationId: string) => Promise<Message[]>} listMessages
 * @property {(message: NewMessage) => Promise<Message>} addMessage
 */

export const DEFAULT_TITLE = 'Nova conversa';

/**
 * @param {{ now?: () => Date }} [options]
 * @returns {ConversationStore}
 */
export function createMemoryStore({ now = () => new Date() } = {}) {
  /** @type {Map<string, Conversation>} */
  const conversations = new Map();
  /** @type {Map<string, Message[]>} */
  const messages = new Map();

  return {
    async createConversation({ userId, title }) {
      const timestamp = now().toISOString();
      const conversation = {
        id: randomUUID(),
        userId,
        title: title ?? DEFAULT_TITLE,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
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
  };
}
