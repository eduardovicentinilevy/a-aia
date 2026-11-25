import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createErrorHandler, notFoundHandler } from './middleware/errors.js';
import { createIpRateLimit, createMessageRateLimit } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-log.js';
import { createConversationsRouter } from './routes/conversations.js';
import { createHealthRouter } from './routes/health.js';
import { createMeRouter } from './routes/me.js';

/** Max JSON body size. A chat message is at most 8000 characters. */
export const BODY_LIMIT = '16kb';

/**
 * Builds the Express app. Every dependency is injected, so tests can pass mocks
 * and no network port is needed (supertest calls the app directly).
 * @param {object} deps
 * @param {Pick<import('./config.js').AppConfig, 'corsOrigins'|'adminEmails'|'dailyTokenLimit'> & { trustProxy?: boolean }} deps.config
 * @param {import('./lib/logger.js').Logger} deps.logger
 * @param {import('./db/store.js').Store} deps.store
 * @param {ReturnType<typeof import('./orchestrator/pipeline.js').createChatPipeline>} deps.pipeline
 * @param {() => Promise<import('./db/pool.js').DatabaseStatus>} deps.checkDb
 * @param {string} deps.version
 * @param {import('express').RequestHandler} deps.authenticate  Sets req.user (Firebase auth, or the dev user locally).
 * @param {ReturnType<typeof import('./orchestrator/usage.js').createUsageLimits>} deps.usageLimits
 * @param {{ ip?: { windowMs?: number, limit?: number }, messages?: { windowMs?: number, limit?: number } }} [deps.rateLimits]
 */
export function createApp({ config, logger, store, pipeline, checkDb, version, authenticate, usageLimits, rateLimits = {} }) {
  const app = express();
  // On Cloud Run, requests arrive through Google's front end: trust exactly one proxy hop
  // so req.ip is the real client address (used by the IP rate limit).
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      maxAge: 600,
    }),
  );
  app.use(requestLogger(logger));
  app.use(createIpRateLimit(rateLimits.ip));
  app.use(express.json({ limit: BODY_LIMIT }));

  app.use('/health', createHealthRouter({ checkDb, version }));
  // Everything below /health requires a logged-in user.
  app.use('/me', authenticate, createMeRouter({ store, config }));
  app.use(
    '/conversations',
    authenticate,
    createConversationsRouter({ store, pipeline, usageLimits, messageRateLimit: createMessageRateLimit(rateLimits.messages), logger }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
