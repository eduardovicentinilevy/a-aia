import { Router } from 'express';
import { dayInSaoPaulo } from '../lib/time.js';

/**
 * Routes about the logged-in user. (DELETE /me and GET /me/export arrive in Phase 5.)
 * @param {object} deps
 * @param {import('../db/store.js').Store} deps.store
 * @param {Pick<import('../config.js').AppConfig, 'adminEmails'|'dailyTokenLimit'>} deps.config
 * @param {() => Date} [deps.clock]
 */
export function createMeRouter({ store, config, clock = () => new Date() }) {
  const router = Router();

  router.get('/', (req, res) => {
    const user = /** @type {any} */ (req).user;
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isAdmin: Boolean(user.email && config.adminEmails.includes(user.email)),
    });
  });

  // Today's consumption (São Paulo calendar day) and the daily limit. dailyTokenLimit 0 = no limit.
  router.get('/usage', async (req, res) => {
    const day = dayInSaoPaulo(clock());
    const usage = await store.getUsage(/** @type {any} */ (req).user.id, day);
    const tokensUsed = usage.tokensIn + usage.tokensOut;
    const limit = config.dailyTokenLimit;
    res.set('Cache-Control', 'no-store').json({
      day,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      tokensUsed,
      dailyTokenLimit: limit,
      remainingTokens: limit === 0 ? null : Math.max(0, limit - tokensUsed),
      costCents: usage.costCents,
    });
  });

  return router;
}
