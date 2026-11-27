import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { INPUT_BLOCKED_MESSAGE, OUTPUT_BLOCKED_MESSAGE, userMessageFor } from './pipeline.js';
import { costCents, estimateTokens } from './usage.js';

/** Writing tones offered by the "Humanizar" screen. */
export const TONES = /** @type {const} */ (['natural', 'informal', 'profissional', 'academico']);

/** How much the text may change. */
export const STRENGTHS = /** @type {const} */ (['leve', 'media', 'forte']);

/** Longest text accepted (same as a chat message). */
export const MAX_TEXT_LENGTH = 8000;

/** Upper bound for the rewritten text, in tokens (8000 characters ≈ 2000 tokens, plus room). */
export const HUMANIZE_MAX_OUTPUT_TOKENS = 4096;

export const ROUTE_REASON_HUMANIZE = 'humanize';

/** @type {Record<typeof TONES[number], string>} */
const TONE_INSTRUCTIONS = {
  natural: 'natural e neutro, como uma pessoa escrevendo com cuidado',
  informal: 'informal e próximo, como numa conversa ou numa mensagem para um conhecido, sem gírias forçadas',
  profissional: 'profissional e claro, adequado para um e-mail de trabalho ou um relatório',
  academico: 'acadêmico, formal e preciso, mas fluido e sem rebuscamento desnecessário',
};

/** @type {Record<typeof STRENGTHS[number], string>} */
const STRENGTH_INSTRUCTIONS = {
  leve: 'leve: troque só o que soa artificial (clichês, repetições, conectivos em série) e mantenha o resto das frases como estão',
  media: 'média: reescreva as frases que precisarem, mantendo a estrutura geral dos parágrafos',
  forte: 'forte: reescreva livremente, com outras palavras, podendo reorganizar frases e parágrafos, sem perder nenhuma informação',
};

/** Removes our delimiter tags from the user's text, so it can never "close" the data block early. */
export function stripDelimiters(text) {
  return text.replace(/<\s*\/?\s*texto_original\s*>/gi, '');
}

/**
 * Builds the messages sent to the model. The user's text goes between delimiters and is
 * treated as untrusted data by the prompt (defense against prompt injection).
 * @param {object} input
 * @param {string} input.systemPrompt
 * @param {string} input.text
 * @param {typeof TONES[number]} input.tone
 * @param {typeof STRENGTHS[number]} input.strength
 * @returns {import('../providers/model/types.js').ChatMessage[]}
 */
export function buildHumanizeMessages({ systemPrompt, text, tone, strength }) {
  const request = [
    `Tom: ${TONE_INSTRUCTIONS[tone]}.`,
    `Intensidade: ${STRENGTH_INSTRUCTIONS[strength]}.`,
    'Tamanho: mantenha aproximadamente o tamanho do original.',
    '',
    '<texto_original>',
    stripDelimiters(text),
    '</texto_original>',
  ].join('\n');
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: request },
  ];
}

/**
 * Output budget for a text: about 1.6× its estimated tokens, at least 512, at most the cap.
 * @param {string} text
 */
export function outputBudgetFor(text) {
  return Math.min(HUMANIZE_MAX_OUTPUT_TOKENS, Math.max(512, Math.ceil(estimateTokens(text) * 1.6)));
}

/**
 * The "Humanizar" flow: rewrites a text so it sounds natural, keeping its meaning.
 * Same protections as the chat (limits checked by the route, input and output moderation,
 * usage and cost recorded), but the text is NOT stored: only the usage counters are.
 *
 * @param {object} deps
 * @param {import('../db/store.js').Store} deps.store
 * @param {import('../providers/model/types.js').ModelProvider} deps.provider
 * @param {import('../providers/moderation/types.js').ModerationProvider} deps.moderation
 * @param {ReturnType<typeof import('./usage.js').createUsageLimits>} deps.usageLimits
 * @param {string} deps.systemPrompt
 * @param {string} deps.promptVersion
 * @param {import('../lib/logger.js').Logger} deps.logger
 * @param {() => number} [deps.clock]
 */
export function createHumanizer({ store, provider, moderation, usageLimits, systemPrompt, promptVersion, logger, clock = () => performance.now() }) {
  return {
    /**
     * @param {object} input
     * @param {string} input.userId
     * @param {string} input.text
     * @param {typeof TONES[number]} input.tone
     * @param {typeof STRENGTHS[number]} input.strength
     * @param {AbortSignal} [input.signal]
     * @param {import('./pipeline.js').Emit} input.emit
     * @returns {Promise<{ status: 'done'|'error'|'aborted'|'blocked' }>}
     */
    async handle({ userId, text, tone, strength, signal, emit }) {
      const start = clock();
      const requestId = randomUUID();
      const elapsed = () => Math.round(clock() - start);

      const inputVerdict = await moderation.check(text, { direction: 'in' });
      if (!inputVerdict.allowed) {
        await store.recordModerationEvent({
          userId,
          direction: 'in',
          category: /** @type {string} */ (inputVerdict.category),
          action: 'blocked',
        });
        logger.warn('moderation_blocked_input', { feature: 'humanize', category: inputVerdict.category });
        emit('meta', { requestId, tier: 'moderation', model: moderation.name, routeReason: 'moderation_blocked', promptVersion });
        emit('token', { text: INPUT_BLOCKED_MESSAGE });
        emit('done', { usage: null, finishReason: 'moderation', latencyMs: elapsed(), firstTokenMs: elapsed() });
        return { status: 'blocked' };
      }

      const messages = buildHumanizeMessages({ systemPrompt, text, tone, strength });
      emit('meta', { requestId, tier: provider.name, model: provider.model, routeReason: ROUTE_REASON_HUMANIZE, promptVersion });

      let output = '';
      /** @type {number|null} */
      let firstTokenMs = null;
      /** @type {import('../providers/model/types.js').Usage|null} */
      let reportedUsage = null;
      /** @type {string|null} */
      let finishReason = null;

      const recordUsage = async () => {
        const tokensIn = reportedUsage?.tokensIn || estimateTokens(messages.map((m) => m.content).join('\n'));
        const tokensOut = reportedUsage?.tokensOut || estimateTokens(output);
        const usage = { tokensIn, tokensOut, costCents: costCents({ tokensIn, tokensOut }, provider.pricing) };
        await usageLimits.record(userId, usage);
        return usage;
      };

      try {
        for await (const event of provider.stream({ messages, maxTokens: outputBudgetFor(text), signal })) {
          if (event.type === 'token') {
            if (firstTokenMs === null) firstTokenMs = elapsed();
            output += event.text;
            emit('token', { text: event.text });
          } else if (event.type === 'done') {
            reportedUsage = event.usage ?? null;
            finishReason = event.finishReason ?? null;
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          if (output) await recordUsage();
          logger.info('humanize_aborted', { requestId, chars: output.length });
          return { status: 'aborted' };
        }
        logger.error('model_stream_failed', {
          feature: 'humanize',
          tier: provider.name,
          model: provider.model,
          error: err,
          status: /** @type {any} */ (err)?.status,
          detail: /** @type {any} */ (err)?.detail,
        });
        emit('error', { code: /** @type {any} */ (err)?.code ?? 'internal', message: userMessageFor(err) });
        return { status: 'error' };
      }

      const outputVerdict = await moderation.check(output, { direction: 'out' });
      const usage = await recordUsage();
      if (!outputVerdict.allowed) {
        await store.recordModerationEvent({
          userId,
          direction: 'out',
          category: /** @type {string} */ (outputVerdict.category),
          action: 'replaced',
        });
        logger.warn('moderation_replaced_output', { feature: 'humanize', requestId, category: outputVerdict.category });
      }

      emit('done', {
        usage: { tokensIn: usage.tokensIn, tokensOut: usage.tokensOut },
        finishReason,
        latencyMs: elapsed(),
        firstTokenMs,
        ...(outputVerdict.allowed ? {} : { replacement: OUTPUT_BLOCKED_MESSAGE }),
      });
      logger.info('humanize_completed', {
        requestId,
        tier: provider.name,
        model: provider.model,
        tone,
        strength,
        chars: text.length,
        latencyMs: elapsed(),
        firstTokenMs,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costCents: usage.costCents,
        usageEstimated: !reportedUsage,
      });
      return { status: 'done' };
    },
  };
}
