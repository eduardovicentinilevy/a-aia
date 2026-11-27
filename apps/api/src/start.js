import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app.js';
import { createMemoryStore } from './db/memory-store.js';
import { pendingMigrations } from './db/migrate.js';
import { checkDatabase, createPool, databaseHint } from './db/pool.js';
import { createPostgresStore } from './db/postgres-store.js';
import { createSqliteStore, openSqliteDatabase } from './db/sqlite-store.js';
import { createLogger } from './lib/logger.js';
import { createAuthMiddleware, createFirebaseTokenVerifier } from './middleware/auth.js';
import { createDevUserMiddleware, DESKTOP_USER } from './middleware/dev-user.js';
import { createHumanizer } from './orchestrator/humanize.js';
import { createChatPipeline } from './orchestrator/pipeline.js';
import { createUsageLimits } from './orchestrator/usage.js';
import { HUMANIZE_PROMPT_VERSION, loadPrompt, loadSystemPrompt, SYSTEM_PROMPT_VERSION } from './prompts/index.js';
import { createProProvider } from './providers/model/pro.js';
import { createModerationProvider } from './providers/moderation/index.js';

/**
 * Picks the storage: SQLite file (desktop), PostgreSQL (DATABASE_URL) or memory (development).
 * @param {Readonly<import('./config.js').AppConfig>} config
 * @param {import('./lib/logger.js').Logger} logger
 */
function createStorage(config, logger) {
  if (config.mode === 'desktop') {
    const store = createSqliteStore(openSqliteDatabase(/** @type {string} */ (config.sqlitePath)));
    return { store, pool: null, close: async () => store.close(), checkDb: async () => ({ ok: true, pgvector: false }) };
  }
  if (config.databaseUrl) {
    const pool = createPool(config.databaseUrl, logger);
    // Friendly diagnosis at startup instead of confusing errors on the first request.
    checkDatabase(pool, { timeoutMs: 5000 }).then(async (status) => {
      if (!status.ok) {
        logger.warn('db_unavailable', { code: status.error, hint: databaseHint(status.error) });
        return;
      }
      const pending = await pendingMigrations(pool);
      if (pending && pending.length > 0) logger.warn('db_migrations_pending', { pending, hint: 'Rode: npm run db:migrate' });
    });
    return { store: createPostgresStore(pool), pool, close: () => pool.end(), checkDb: () => checkDatabase(pool) };
  }
  logger.warn('db_not_configured', { hint: 'DATABASE_URL vazio: usando memória (os dados somem ao reiniciar).' });
  return { store: createMemoryStore(), pool: null, close: async () => {}, checkDb: () => checkDatabase(null) };
}

/**
 * Wires every dependency and starts listening. Used by `npm run dev`/`start` (src/server.js)
 * and by the desktop app (apps/desktop), which runs the API inside its own process.
 * @param {Readonly<import('./config.js').AppConfig>} config  From loadConfig().
 * @param {{ logger?: import('./lib/logger.js').Logger }} [options]
 * @returns {Promise<{ port: number, url: string, close: () => Promise<void> }>}
 */
export async function startServer(config, { logger = createLogger({ level: config.logLevel }) } = {}) {
  const desktopMode = config.mode === 'desktop';
  const storage = createStorage(config, logger);
  const { store } = storage;

  // Real login when FIREBASE_PROJECT_ID is set; otherwise everyone is a single local user
  // ("Dev local" in development, "Você" in the desktop app). Config forbids that on the server.
  const authenticate = config.firebaseProjectId
    ? createAuthMiddleware({
        verifyToken: createFirebaseTokenVerifier({ projectId: config.firebaseProjectId }),
        store,
        allowedEmails: config.allowedEmails,
        logger,
      })
    : createDevUserMiddleware(store, desktopMode ? DESKTOP_USER : undefined);
  if (!config.firebaseProjectId && !desktopMode) {
    logger.warn('auth_disabled', { hint: 'FIREBASE_PROJECT_ID vazio: login desligado, todos são o usuário "Dev local".' });
  }

  const proProvider = createProProvider(config.pro);
  const moderation = createModerationProvider(config.moderationProvider);
  const usageLimits = createUsageLimits({
    store,
    dailyTokenLimit: config.dailyTokenLimit,
    monthlyBudgetCents: config.monthlyBudgetCents,
  });
  const pipeline = createChatPipeline({
    store,
    proProvider,
    moderation,
    usageLimits,
    systemPrompt: loadSystemPrompt(SYSTEM_PROMPT_VERSION),
    promptVersion: SYSTEM_PROMPT_VERSION,
    maxOutputTokens: config.maxOutputTokens,
    logger,
  });
  const humanizer = createHumanizer({
    store,
    provider: proProvider,
    moderation,
    usageLimits,
    systemPrompt: loadPrompt('humanize', HUMANIZE_PROMPT_VERSION),
    promptVersion: `humanize.${HUMANIZE_PROMPT_VERSION}`,
    logger,
  });

  let port = config.port;
  const app = createApp({
    config: { ...config, trustProxy: config.nodeEnv === 'production' && !desktopMode },
    logger,
    store,
    pipeline,
    humanizer,
    checkDb: storage.checkDb,
    version: pkg.version,
    authenticate,
    usageLimits,
    desktop: desktopMode ? { getPort: () => port, webDistDir: config.webDistDir } : undefined,
  });

  // Development and desktop listen only on this machine (no firewall prompt, not exposed to the
  // network). The desktop app uses 127.0.0.1 explicitly: "localhost" may resolve to IPv6 first.
  const host = desktopMode ? '127.0.0.1' : config.nodeEnv === 'development' ? 'localhost' : '0.0.0.0';
  const server = await new Promise((resolve, reject) => {
    const listening = app.listen(config.port, host, () => resolve(listening));
    listening.once('error', reject);
  });
  port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  const url = `http://${desktopMode ? '127.0.0.1' : 'localhost'}:${port}`;
  logger.info('server_started', {
    url,
    mode: config.mode,
    proProvider: config.pro.provider,
    proModel: proProvider.model,
    promptVersion: SYSTEM_PROMPT_VERSION,
  });

  return {
    port,
    url,
    async close() {
      await new Promise((resolve) => {
        server.close(() => resolve(undefined));
        server.closeAllConnections(); // open SSE streams would keep it alive
      });
      await storage.close();
    },
  };
}
