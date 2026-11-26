import { parseSSE } from './sse-parser.js';

/** API address. Set VITE_API_BASE_URL in the root .env to change it (the deploy sets the production URL). */
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8080';

/** Error returned by the API, with a message that can be shown to the user. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {string} [code]
   */
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** @type {() => Promise<string|null>} */
let getToken = async () => null;
/** @type {(error: ApiError) => void} */
let onAuthError = () => {};

/**
 * Plugs authentication into every request.
 * @param {{ getToken: () => Promise<string|null>, onAuthError?: (error: ApiError) => void }} options
 *   onAuthError is called on 401 (session expired) and 403 (not invited / e-mail not verified).
 */
export function configureApi(options) {
  getToken = options.getToken;
  onAuthError = options.onAuthError ?? (() => {});
}

/** @param {Response} response */
async function toApiError(response) {
  let message = `A API respondeu com erro ${response.status}.`;
  let code;
  try {
    const body = await response.json();
    message = body?.error?.message ?? message;
    code = body?.error?.code;
  } catch {
    // Body was not JSON: keep the generic message.
  }
  return new ApiError(message, response.status, code);
}

/**
 * fetch() with the API base URL, the Bearer token and uniform error handling.
 * @param {string} path
 * @param {RequestInit & { json?: unknown }} [init]
 */
async function apiFetch(path, { json, headers, ...init } = {}) {
  const token = await getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : init.body,
  });
  if (!response.ok) {
    const error = await toApiError(response);
    if (response.status === 401 || response.status === 403) onAuthError(error);
    throw error;
  }
  return response;
}

/** @returns {Promise<{ id: string, email: string|null, displayName: string|null, isAdmin: boolean }>} */
export async function getMe() {
  return (await apiFetch('/me')).json();
}

/** @returns {Promise<{ day: string, tokensUsed: number, dailyTokenLimit: number, remainingTokens: number|null }>} */
export async function getUsage() {
  return (await apiFetch('/me/usage')).json();
}

/**
 * @typedef {{ id: string, title: string, createdAt: string, updatedAt: string }} ConversationSummary
 */

/** @returns {Promise<ConversationSummary[]>} */
export async function listConversations() {
  return (await (await apiFetch('/conversations')).json()).conversations;
}

/**
 * Creates an empty conversation.
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<ConversationSummary>}
 */
export async function createConversation({ signal } = {}) {
  return (await apiFetch('/conversations', { method: 'POST', json: {}, signal })).json();
}

/** @param {string} id @param {string} title @returns {Promise<ConversationSummary>} */
export async function renameConversation(id, title) {
  return (await apiFetch(`/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', json: { title } })).json();
}

/** @param {string} id */
export async function deleteConversation(id) {
  await apiFetch(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * @typedef {{ id: string, role: 'user'|'assistant'|'system', content: string, model: string|null,
 *   routeReason: string|null, latencyMs: number|null, firstTokenMs: number|null, createdAt: string }} ServerMessage
 */

/** @param {string} id @param {{ signal?: AbortSignal }} [options] @returns {Promise<ServerMessage[]>} */
export async function getMessages(id, { signal } = {}) {
  return (await (await apiFetch(`/conversations/${encodeURIComponent(id)}/messages`, { signal })).json()).messages;
}

/**
 * Sends a message and calls `onEvent` for each Server-Sent Event of the answer
 * (meta, token, done, error). We use fetch + ReadableStream instead of EventSource
 * because EventSource cannot send a POST body (nor an Authorization header).
 * @param {string} conversationId
 * @param {string} content
 * @param {{ signal?: AbortSignal, onEvent: (event: string, data: any) => void }} options
 */
export async function sendMessage(conversationId, content, { signal, onEvent }) {
  const response = await apiFetch(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    json: { content },
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!response.body) throw new ApiError('A API devolveu uma resposta vazia.', response.status);

  for await (const { event, data } of parseSSE(response.body)) {
    onEvent(event, JSON.parse(data));
  }
}
