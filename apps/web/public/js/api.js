import { API_BASE_URL } from './config.js';
import { parseSSE } from './sse-parser.js';

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

/** @returns {Promise<{ id: string, title: string }>} */
export async function createConversation() {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw await toApiError(response);
  return response.json();
}

/**
 * Sends a message and calls `onEvent` for each Server-Sent Event of the answer.
 * We use fetch + ReadableStream instead of EventSource because EventSource cannot send a POST body.
 * @param {string} conversationId
 * @param {string} content
 * @param {{ signal?: AbortSignal, onEvent: (event: string, data: any) => void }} options
 */
export async function sendMessage(conversationId, content, { signal, onEvent }) {
  const response = await fetch(`${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!response.ok) throw await toApiError(response);
  if (!response.body) throw new ApiError('A API devolveu uma resposta vazia.', response.status);

  for await (const { event, data } of parseSSE(response.body)) {
    onEvent(event, JSON.parse(data));
  }
}
