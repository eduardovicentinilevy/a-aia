import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createDevUserMiddleware } from './middleware/dev-user.js';
import { createErrorHandler, notFoundHandler } from './middleware/errors.js';
import { requestLogger } from './middleware/request-log.js';
import { createConversationsRouter } from './routes/conversations.js';
import { createHealthRouter } from './routes/health.js';

/** Max JSON body size. A chat message is at most 8000 characters. */
export const BODY_LIMIT = '16kb';

/**
 * Builds the Express app. Every dependency is injected, so tests can pass mocks
 * and no network port is needed (supertest calls the app directly).
 * @param {object} deps
 * @param {Pick<import('./config.js').AppConfig, 'corsOrigins'>} deps.config
 * @param {import('./lib/logger.js').Logger} deps.logger
 * @param {import('./db/store.js').Store} deps.store
 * @param {ReturnType<typeof import('./orchestrator/pipeline.js').createChatPipeline>} deps.pipeline
 * @param {() => Promise<import('./db/pool.js').DatabaseStatus>} deps.checkDb
 * @param {string} deps.version
 */
export function createApp({ config, logger, store, pipeline, checkDb, version }) {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(requestLogger(logger));

  app.use('/health', createHealthRouter({ checkDb, version }));
  app.use('/conversations', createDevUserMiddleware(store), createConversationsRouter({ store, pipeline, logger }));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
