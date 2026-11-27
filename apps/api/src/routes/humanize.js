import { Router } from 'express';
import { z } from 'zod';
import { openEventStream } from '../lib/sse.js';
import { MAX_TEXT_LENGTH, STRENGTHS, TONES } from '../orchestrator/humanize.js';

const HumanizeBody = z.strictObject({
  text: z
    .string()
    .trim()
    .min(1, 'O texto está vazio.')
    .max(MAX_TEXT_LENGTH, `O texto passou de ${MAX_TEXT_LENGTH} caracteres.`),
  tone: z.enum(TONES, 'Tom inválido.').default('natural'),
  strength: z.enum(STRENGTHS, 'Intensidade inválida.').default('media'),
});

/**
 * POST /humanize — rewrites a text so it sounds natural. The answer is streamed as SSE:
 * meta → token* → done   (or meta → token* → error). Nothing is stored except usage.
 * @param {object} deps
 * @param {ReturnType<typeof import('../orchestrator/humanize.js').createHumanizer>} deps.humanizer
 * @param {ReturnType<typeof import('../orchestrator/usage.js').createUsageLimits>} deps.usageLimits
 * @param {import('express').RequestHandler} deps.rateLimit
 * @param {import('../lib/logger.js').Logger} deps.logger
 */
export function createHumanizeRouter({ humanizer, usageLimits, rateLimit, logger }) {
  const router = Router();

  router.post('/', rateLimit, async (req, res) => {
    const body = HumanizeBody.parse(req.body ?? {});
    const userId = /** @type {any} */ (req).user.id;
    await usageLimits.assertWithinLimits(userId);

    const controller = new AbortController();
    res.once('close', () => {
      if (!res.writableFinished) controller.abort();
    });

    const stream = openEventStream(res);
    try {
      await humanizer.handle({ userId, ...body, signal: controller.signal, emit: stream.send });
    } catch (err) {
      logger.error('humanize_failed', { error: err });
      stream.send('error', { code: 'internal', message: 'Algo deu errado ao reescrever o texto. Tente de novo.' });
    } finally {
      stream.end();
    }
  });

  return router;
}
