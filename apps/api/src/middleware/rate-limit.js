import { rateLimit } from 'express-rate-limit';

/**
 * Rate limits ("no more than N requests per window"). Counters live in the memory of each
 * instance: with Cloud Run's max of 2 instances, the real limit is at most 2× the number here.
 * That is fine for the MVP; a shared store (e.g. Redis) would make it exact.
 */

/** @param {string} code @param {string} message @returns {import('express').RequestHandler} */
const reject = (code, message) => (_req, res) => {
  res.status(429).json({ error: { code, message } });
};

/**
 * Per IP address, for every route except /health. Blocks floods and scripts.
 * @param {{ windowMs?: number, limit?: number }} [options]
 */
export function createIpRateLimit({ windowMs = 60_000, limit = 120 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
    handler: reject('rate_limited', 'Muitas requisições em pouco tempo. Espere um pouco e tente de novo.'),
  });
}

/**
 * Per logged-in user, only for sending messages (each one costs a model call).
 * Must run AFTER the auth middleware, because it uses req.user.id.
 * @param {{ windowMs?: number, limit?: number }} [options]
 */
export function createMessageRateLimit({ windowMs = 60_000, limit = 15 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => /** @type {any} */ (req).user.id,
    handler: reject('too_many_messages', 'Você mandou muitas mensagens em pouco tempo. Espere um minutinho.'),
  });
}
