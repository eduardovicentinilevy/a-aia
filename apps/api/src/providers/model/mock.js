import { setTimeout as sleep } from 'node:timers/promises';
import { ProviderError } from '../errors.js';

/** @typedef {import('./types.js').ModelProvider} ModelProvider */
/** @typedef {import('./types.js').ChatMessage} ChatMessage */

/** @param {ChatMessage[]} messages */
function defaultReply(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const excerpt = lastUser.length > 200 ? `${lastUser.slice(0, 200)}…` : lastUser;
  return (
    'Oi! Eu sou a AçaIA em **modo de teste** (MockProvider): nenhum modelo de verdade está respondendo agora. ' +
    `Você escreveu: "${excerpt}". ` +
    'Para conversar com um modelo real, configure o Pro no arquivo .env (veja docs/RUNBOOK.md).'
  );
}

/**
 * Fake model for tests and offline development. Streams a canned reply word by word.
 * @param {object} [options]
 * @param {string} [options.name]
 * @param {string} [options.model]
 * @param {number} [options.delayMs]  Delay between tokens, to look like real streaming.
 * @param {string | ((messages: ChatMessage[]) => string)} [options.reply]
 * @param {{ afterTokens: number, error: Error }} [options.fail]  Throws after N tokens (tests).
 * @returns {ModelProvider}
 */
export function createMockProvider({ name = 'mock', model = 'mock', delayMs = 20, reply, fail } = {}) {
  return {
    name,
    model,
    async *stream({ messages, maxTokens, signal }) {
      const text = typeof reply === 'function' ? reply(messages) : (reply ?? defaultReply(messages));
      // Keep whitespace attached to each word so the client can just concatenate.
      const tokens = (text.match(/\S+\s*|\s+/g) ?? []).slice(0, maxTokens);
      const tokensIn = Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
      let tokensOut = 0;

      for (const token of tokens) {
        if (fail && tokensOut >= fail.afterTokens) throw fail.error;
        if (signal?.aborted) throw new ProviderError('Request aborted', { code: 'aborted' });
        if (delayMs > 0) {
          try {
            await sleep(delayMs, undefined, { signal });
          } catch (err) {
            throw new ProviderError('Request aborted', { code: 'aborted', cause: err });
          }
        }
        tokensOut += 1;
        yield { type: 'token', text: token };
      }
      if (fail && tokensOut >= fail.afterTokens) throw fail.error;
      yield { type: 'done', usage: { tokensIn, tokensOut }, finishReason: 'stop' };
    },
  };
}
