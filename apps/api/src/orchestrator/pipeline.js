import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DEFAULT_TITLE } from '../db/store.js';
import { buildContext } from './context.js';
import { costCents, estimateTokens } from './usage.js';

/** Only the Pro tier exists until the Copinho (Phase 3) and the router (Phase 4). */
export const ROUTE_REASON_PRO_ONLY = 'pro_only';
export const ROUTE_REASON_BLOCKED = 'moderation_blocked';

/** Polite refusal when the user's message is blocked (CLAUDE.md §5.7 step 2). */
export const INPUT_BLOCKED_MESSAGE =
  'Não posso ajudar com isso, porque pode causar dano real. Se quiser, posso falar do assunto de forma segura: explicar os riscos, o que diz a lei ou onde buscar ajuda.';

/** Replaces an answer that failed output moderation (CLAUDE.md §5.7 step 6). */
export const OUTPUT_BLOCKED_MESSAGE =
  'Removi esta resposta porque ela não passou na nossa checagem de segurança. Tente reformular a pergunta.';

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
 * The orchestrator pipeline for one chat message (CLAUDE.md §5.7). Phase 1 version:
 *   (limits are checked by the route before streaming starts)
 *   persist user message → input moderation → build context → stream from the model
 *   → output moderation → persist answer → record usage and cost.
 * Routing (Copinho vs Pro), RAG and web search are added in Phase 4.
 *
 * @param {object} deps
 * @param {import('../db/store.js').Store} deps.store
 * @param {import('../providers/model/types.js').ModelProvider} deps.proProvider
 * @param {import('../providers/moderation/types.js').ModerationProvider} deps.moderation
 * @param {ReturnType<typeof import('./usage.js').createUsageLimits>} deps.usageLimits
 * @param {string} deps.systemPrompt
 * @param {string} deps.promptVersion
 * @param {number} deps.maxOutputTokens
 * @param {import('../lib/logger.js').Logger} deps.logger
 * @param {() => number} [deps.clock] Milliseconds, monotonic.
 */
export function createChatPipeline({
  store,
  proProvider,
  moderation,
  usageLimits,
  systemPrompt,
  promptVersion,
  maxOutputTokens,
  logger,
  clock = () => performance.now(),
}) {
  return {
    /**
     * @param {object} input
     * @param {string} input.userId
     * @param {{ id: string, title: string }} input.conversation
     * @param {string} input.content
     * @param {AbortSignal} [input.signal]  Aborted when the client disconnects.
     * @param {Emit} input.emit
     * @returns {Promise<{ status: 'done'|'error'|'aborted'|'blocked' }>}
     */
    async handleMessage({ userId, conversation, content, signal, emit }) {
      const start = clock();
      const conversationId = conversation.id;

      const previous = await store.listMessages(conversationId);
      if (previous.length === 0 && conversation.title === DEFAULT_TITLE) {
        await store.updateConversation(conversationId, { title: titleFrom(content) });
      }
      const userMessage = await store.addMessage({ conversationId, role: 'user', content });

      // --- Input moderation -------------------------------------------------
      const inputVerdict = await moderation.check(content, { direction: 'in' });
      if (!inputVerdict.allowed) {
        const refusal = await store.addMessage({
          conversationId,
          role: 'assistant',
          content: INPUT_BLOCKED_MESSAGE,
          model: moderation.name,
          routeReason: ROUTE_REASON_BLOCKED,
          latencyMs: Math.round(clock() - start),
          firstTokenMs: Math.round(clock() - start),
        });
        await store.recordModerationEvent({
          userId,
          messageId: userMessage.id,
          direction: 'in',
          category: /** @type {string} */ (inputVerdict.category),
          action: 'blocked',
        });
        logger.warn('moderation_blocked_input', { conversationId, category: inputVerdict.category });
        emit('meta', { conversationId, messageId: refusal.id, tier: 'moderation', model: moderation.name, routeReason: ROUTE_REASON_BLOCKED, promptVersion });
        emit('token', { text: INPUT_BLOCKED_MESSAGE });
        emit('done', { messageId: refusal.id, usage: null, finishReason: 'moderation', latencyMs: refusal.latencyMs, firstTokenMs: refusal.firstTokenMs });
        return { status: 'blocked' };
      }

      // --- Generation ---------------------------------------------------------
      const messages = buildContext({ systemPrompt, history: [...previous, { role: 'user', content }] });
      const provider = proProvider;
      const routeReason = ROUTE_REASON_PRO_ONLY;
      const messageId = randomUUID();

      emit('meta', { conversationId, messageId, tier: provider.name, model: provider.model, routeReason, promptVersion });

      let text = '';
      /** @type {number|null} */
      let firstTokenMs = null;
      /** @type {import('../providers/model/types.js').Usage|null} */
      let reportedUsage = null;
      /** @type {string|null} */
      let finishReason = null;

      /** Provider-reported token counts, or an estimate when it sent none. */
      const measuredUsage = () => {
        const tokensIn = reportedUsage?.tokensIn || estimateTokens(messages.map((m) => m.content).join('\n'));
        const tokensOut = reportedUsage?.tokensOut || estimateTokens(text);
        return { tokensIn, tokensOut, costCents: costCents({ tokensIn, tokensOut }, provider.pricing) };
      };

      /** @param {string} finalText */
      const persistAnswer = async (finalText) => {
        const usage = measuredUsage();
        const saved = await store.addMessage({
          id: messageId,
          conversationId,
          role: 'assistant',
          content: finalText,
          model: provider.model,
          routeReason,
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          latencyMs: Math.round(clock() - start),
          firstTokenMs,
        });
        await usageLimits.record(userId, usage);
        return { saved, usage };
      };

      try {
        for await (const event of provider.stream({ messages, maxTokens: maxOutputTokens, signal })) {
          if (event.type === 'token') {
            if (firstTokenMs === null) firstTokenMs = Math.round(clock() - start);
            text += event.text;
            emit('token', { text: event.text });
          } else if (event.type === 'done') {
            reportedUsage = event.usage ?? null;
            finishReason = event.finishReason ?? null;
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          // The user closed the tab or pressed "stop": keep what they already saw (and count it).
          if (text) await persistAnswer(text);
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

      // --- Output moderation (MVP: checked once, at the end) -------------------
      const outputVerdict = await moderation.check(text, { direction: 'out' });
      const replacement = outputVerdict.allowed ? null : OUTPUT_BLOCKED_MESSAGE;

      const { saved, usage } = await persistAnswer(replacement ?? text);
      if (replacement) {
        await store.recordModerationEvent({
          userId,
          messageId: saved.id,
          direction: 'out',
          category: /** @type {string} */ (outputVerdict.category),
          action: 'replaced',
        });
        logger.warn('moderation_replaced_output', { conversationId, messageId, category: outputVerdict.category });
      }

      emit('done', {
        messageId,
        usage: { tokensIn: usage.tokensIn, tokensOut: usage.tokensOut },
        finishReason,
        latencyMs: saved.latencyMs,
        firstTokenMs: saved.firstTokenMs,
        ...(replacement ? { replacement } : {}),
      });
      logger.info('chat_completed', {
        conversationId,
        messageId,
        tier: provider.name,
        model: provider.model,
        routeReason,
        latencyMs: saved.latencyMs,
        firstTokenMs: saved.firstTokenMs,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costCents: usage.costCents,
        usageEstimated: !reportedUsage,
      });
      return { status: 'done' };
    },
  };
}
