/** How many previous messages are sent to the model (summaries of long chats come later). */
export const MAX_HISTORY_MESSAGES = 20;

/**
 * Builds the message list sent to the model: system prompt + recent history.
 * Phase 4 adds PDF chunks and web results here, wrapped as untrusted data.
 * @param {object} input
 * @param {string} input.systemPrompt
 * @param {{ role: string, content: string }[]} input.history  Already includes the new user message.
 * @param {number} [input.maxHistoryMessages]
 * @returns {import('../providers/model/types.js').ChatMessage[]}
 */
export function buildContext({ systemPrompt, history, maxHistoryMessages = MAX_HISTORY_MESSAGES }) {
  const recent = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-maxHistoryMessages)
    .map((m) => ({ role: /** @type {'user'|'assistant'} */ (m.role), content: m.content }));
  return [{ role: 'system', content: systemPrompt }, ...recent];
}
