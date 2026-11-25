/**
 * Chat state as a pure reducer: (state, action) => newState.
 * No fetch, no DOM, no randomness — which makes it easy to test and safe under React StrictMode.
 *
 * @typedef {{ tier: string, model: string, routeReason?: string }} AnswerMeta
 * @typedef {{ firstTokenMs: number|null, latencyMs: number|null }} AnswerStats
 *
 * @typedef {object} ChatMessage
 * @property {string} id
 * @property {'user'|'assistant'} role
 * @property {string} text
 * @property {'streaming'|'done'|'stopped'|'error'} status
 * @property {AnswerMeta|null} [meta]
 * @property {AnswerStats|null} [stats]
 * @property {string|null} [error]
 *
 * @typedef {object} ChatState
 * @property {ChatMessage[]} messages
 * @property {string|null} streamingId  Id of the answer being generated, or null.
 *
 * @typedef {{ type: 'send', userId: string, assistantId: string, content: string }
 *   | { type: 'event', id: string, event: string, data: any }
 *   | { type: 'stopped', id: string }
 *   | { type: 'failed', id: string, message: string }
 *   | { type: 'finished', id: string }
 *   | { type: 'reset' }} ChatAction
 */

export const CONNECTION_LOST_MESSAGE = 'A conexão caiu antes do fim da resposta. Tente de novo.';

/** @type {ChatState} */
export const initialChatState = { messages: [], streamingId: null };

/**
 * Returns a new state where message `id` is patched; the same state if nothing changed.
 * @param {ChatState} state
 * @param {string} id
 * @param {(message: ChatMessage) => Partial<ChatMessage>|null} patch  Return null for "no change".
 * @returns {ChatState}
 */
function patchMessage(state, id, patch) {
  const index = state.messages.findIndex((m) => m.id === id);
  if (index === -1) return state;
  const changes = patch(state.messages[index]);
  if (!changes) return state;
  const messages = state.messages.slice();
  messages[index] = { ...messages[index], ...changes };
  return { ...state, messages };
}

/**
 * Applies one Server-Sent Event from the API to the answer `id`.
 * @param {ChatState} state
 * @param {string} id
 * @param {string} event
 * @param {any} data
 */
function applyServerEvent(state, id, event, data) {
  switch (event) {
    case 'meta':
      return patchMessage(state, id, () => ({ meta: { tier: data.tier, model: data.model, routeReason: data.routeReason } }));
    case 'token':
      return patchMessage(state, id, (m) => ({ text: m.text + data.text }));
    case 'done':
      return patchMessage(state, id, () => ({
        status: 'done',
        stats: { firstTokenMs: data.firstTokenMs ?? null, latencyMs: data.latencyMs ?? null },
      }));
    case 'error':
      return patchMessage(state, id, () => ({ status: 'error', error: data.message }));
    default:
      return state; // e.g. 'sources' (Phase 4) is ignored for now
  }
}

/**
 * @param {ChatState} state
 * @param {ChatAction} action
 * @returns {ChatState}
 */
export function chatReducer(state, action) {
  switch (action.type) {
    case 'send':
      return {
        messages: [
          ...state.messages,
          { id: action.userId, role: 'user', text: action.content, status: 'done' },
          { id: action.assistantId, role: 'assistant', text: '', status: 'streaming', meta: null, stats: null, error: null },
        ],
        streamingId: action.assistantId,
      };

    case 'event':
      return applyServerEvent(state, action.id, action.event, action.data);

    case 'stopped':
      return patchMessage(state, action.id, (m) => (m.status === 'streaming' ? { status: 'stopped' } : null));

    case 'failed':
      return patchMessage(state, action.id, () => ({ status: 'error', error: action.message }));

    case 'finished': {
      // The stream ended. If no 'done'/'error' arrived, the connection was cut.
      const next = patchMessage(state, action.id, (m) =>
        m.status === 'streaming' ? { status: 'error', error: CONNECTION_LOST_MESSAGE } : null,
      );
      // Ignore a late 'finished' from an older request (e.g. after "Nova conversa").
      return next.streamingId === action.id ? { ...next, streamingId: null } : next;
    }

    case 'reset':
      return initialChatState;

    default:
      return state;
  }
}
