/**
 * The data-access contract ("repository") used by routes and the orchestrator.
 * Two implementations follow it exactly:
 *   - memory-store.js   → tests and development without a database
 *   - postgres-store.js → real use (Docker locally, Neon in production)
 * A shared test suite (test/store.contract.test.js) runs against both.
 *
 * @typedef {object} User
 * @property {string} id
 * @property {string} authUid       Firebase UID
 * @property {string|null} email
 * @property {string|null} displayName
 * @property {string} createdAt
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
 * @typedef {{ tokensIn: number, tokensOut: number, costCents: number }} Usage
 *
 * @typedef {object} ModerationEvent
 * @property {string|null} userId
 * @property {string|null} [messageId]
 * @property {'in'|'out'} direction
 * @property {string} category
 * @property {string} action
 *
 * @typedef {object} Store
 * @property {(input: { authUid: string, email?: string|null, displayName?: string|null }) => Promise<User>} upsertUser
 *   Creates the user on first login; refreshes email/name afterwards.
 * @property {(input: { userId: string, title?: string }) => Promise<Conversation>} createConversation
 * @property {(userId: string) => Promise<Conversation[]>} listConversations  Most recent first.
 * @property {(id: string, userId: string) => Promise<Conversation|null>} getConversation  Null if missing or not owned.
 * @property {(id: string, changes: { title: string }) => Promise<void>} updateConversation
 * @property {(id: string, userId: string) => Promise<boolean>} deleteConversation  False if missing or not owned.
 * @property {(conversationId: string) => Promise<Message[]>} listMessages  Oldest first.
 * @property {(message: NewMessage) => Promise<Message>} addMessage  Also bumps the conversation's updatedAt.
 * @property {(userId: string, day: string) => Promise<Usage>} getUsage  `day` is YYYY-MM-DD (São Paulo time).
 * @property {(userId: string, day: string, delta: Usage) => Promise<void>} addUsage
 * @property {(fromDay: string, toDay: string) => Promise<number>} getTotalCostCents  All users, inclusive range.
 * @property {(event: ModerationEvent) => Promise<void>} recordModerationEvent
 */

export const DEFAULT_TITLE = 'Nova conversa';

/** @type {Usage} */
export const ZERO_USAGE = Object.freeze({ tokensIn: 0, tokensOut: 0, costCents: 0 });
