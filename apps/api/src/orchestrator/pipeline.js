import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DEFAULT_TITLE } from '../db/memory-store.js';
import { buildContext } from './context.js';

/** Phase 0 has a single model tier; the real router arrives in Phase 4. */
export const ROUTE_REASON_PHASE0 = 'phase0_pro_only';

/**
 * Maps an internal error to a short message for the user (PT-BR). Details stay in the logs.
 * @param {any} err
 */
export function userMessageFor(err) {
  if (err?.code === 'timeout') return 'O modelo demorou demais para responder. Tente de novo em instantes.';
  if (err?.code === 'http_error' && err.status === 429) {
    return 'O limite de uso do modelo foi atingido. Espere um pouco e tente de novo.';
  }
  if (err?.code === 'http_error' || err?.code === 'network' || err?.code === 'bad_response') {
    return 'Não consegui falar com o modelo agora. Tente de novo em instantes.';
  }
  return 'Algo deu errado ao gerar a resposta. Tente de novo.';
}

/** @param {string} content */
function titleFrom(content) {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine;
}

/**
 * @typedef {(event: 'meta'|'token'|'done'|'error', data: unknown) => unknown} Emit
 */

/**
 * The orchestrator pipeline for one chat message (Phase 0 version):
 * persist user message → build context → stream from the model → persist answer.
 * Moderation, routing, RAG and web search are added in later phases.
 *
 * @param {object} deps
 * @param {import('../db/memory-store.js').ConversationStore} deps.store
 * @param {import('../providers/model/types.js').ModelProvider} deps.proProvider
 * @param {string} deps.systemPrompt
 * @param {string} deps.promptVersion
 * @param {number} deps.maxOutputTokens
 * @param {import('../lib/logger.js').Logger} deps.logger
 * @param {() => number} [deps.clock] Milliseconds, monotonic.
 */
export function createChatPipeline({ store, proProvider, systemPrompt, promptVersion, maxOutputTokens, logger, clock = () => performance.now() }) {
  return {
    /**
     * @param {object} input
     * @param {{ id: string, title: string }} input.conversation
     * @param {string} input.content
     * @param {AbortSignal} [input.signal]  Aborted when the client disconnects.
     * @param {Emit} input.emit
     * @returns {Promise<{ status: 'done'|'error'|'aborted' }>}
     */
    async handleMessage({ conversation, content, signal, emit }) {
      const start = clock();
      const conversationId = conversation.id;

      const previous = await store.listMessages(conversationId);
      if (previous.length === 0 && conversation.title === DEFAULT_TITLE) {
        await store.updateConversation(conversationId, { title: titleFrom(content) });
      }
      await store.addMessage({ conversationId, role: 'user', content });

      const messages = buildContext({ systemPrompt, history: [...previous, { role: 'user', content }] });
      const provider = proProvider;
      const routeReason = ROUTE_REASON_PHASE0;
      const messageId = randomUUID();

      emit('meta', { conversationId, messageId, tier: provider.name, model: provider.model, routeReason, promptVersion });

      let text = '';
      /** @type {number|null} */
      let firstTokenMs = null;
      /** @type {import('../providers/model/types.js').Usage|null} */
      let usage = null;
      /** @type {string|null} */
      let finishReason = null;

      const persistAnswer = () =>
        store.addMessage({
          id: messageId,
          conversationId,
          role: 'assistant',
          content: text,
          model: provider.model,
          routeReason,
          tokensIn: usage?.tokensIn ?? null,
          tokensOut: usage?.tokensOut ?? null,
          latencyMs: Math.round(clock() - start),
          firstTokenMs,
        });

      try {
        for await (const event of provider.stream({ messages, maxTokens: maxOutputTokens, signal })) {
          if (event.type === 'token') {
            if (firstTokenMs === null) firstTokenMs = Math.round(clock() - start);
            text += event.text;
            emit('token', { text: event.text });
          } else if (event.type === 'done') {
            usage = event.usage ?? null;
            finishReason = event.finishReason ?? null;
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          // The user closed the tab or pressed "stop": keep what they already saw.
          if (text) await persistAnswer();
          logger.info('chat_aborted', { conversationId, messageId, chars: text.length });
          return { status: 'aborted' };
        }
        logger.error('model_stream_failed', {
          conversationId,
          tier: provider.name,
          model: provider.model,
          error: err,
          status: /** @type {any} */ (err)?.status,
          detail: /** @type {any} */ (err)?.detail,
        });
        emit('error', { code: /** @type {any} */ (err)?.code ?? 'internal', message: userMessageFor(err) });
        return { status: 'error' };
      }

      const saved = await persistAnswer();
      emit('done', {
        messageId,
        usage,
        finishReason,
        latencyMs: saved.latencyMs,
        firstTokenMs: saved.firstTokenMs,
      });
      logger.info('chat_completed', {
        conversationId,
        messageId,
        tier: provider.name,
        model: provider.model,
        routeReason,
        latencyMs: saved.latencyMs,
        firstTokenMs: saved.firstTokenMs,
        tokensIn: saved.tokensIn,
        tokensOut: saved.tokensOut,
      });
      return { status: 'done' };
    },
  };
}
