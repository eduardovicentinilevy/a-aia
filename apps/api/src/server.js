import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createMemoryStore } from './db/memory-store.js';
import { pendingMigrations } from './db/migrate.js';
import { checkDatabase, createPool } from './db/pool.js';
import { createPostgresStore } from './db/postgres-store.js';
import { createLogger } from './lib/logger.js';
import { createAuthMiddleware, createFirebaseTokenVerifier } from './middleware/auth.js';
import { createDevUserMiddleware } from './middleware/dev-user.js';
import { createChatPipeline } from './orchestrator/pipeline.js';
import { loadSystemPrompt, SYSTEM_PROMPT_VERSION } from './prompts/index.js';
import { createProProvider } from './providers/model/pro.js';

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const logger = createLogger({ level: config.logLevel });
const pool = config.databaseUrl ? createPool(config.databaseUrl, logger) : null;
const store = pool ? createPostgresStore(pool) : createMemoryStore();

if (pool) {
  // Friendly reminder instead of confusing SQL errors later ("relation users does not exist").
  pendingMigrations(pool).then((pending) => {
    if (pending === null) logger.warn('db_unreachable', { hint: 'Banco fora do ar? Rode: npm run db:up' });
    else if (pending.length > 0) logger.warn('db_migrations_pending', { pending, hint: 'Rode: npm run db:migrate' });
  });
} else {
  logger.warn('db_not_configured', { hint: 'DATABASE_URL vazio: usando memória (os dados somem ao reiniciar).' });
}
// Real login when FIREBASE_PROJECT_ID is set; otherwise (development only — config enforces it)
// everyone is the single "Dev local" user.
const authenticate = config.firebaseProjectId
  ? createAuthMiddleware({
      verifyToken: createFirebaseTokenVerifier({ projectId: config.firebaseProjectId }),
      store,
      allowedEmails: config.allowedEmails,
      logger,
    })
  : createDevUserMiddleware(store);
if (!config.firebaseProjectId) {
  logger.warn('auth_disabled', { hint: 'FIREBASE_PROJECT_ID vazio: login desligado, todos são o usuário "Dev local".' });
}

const proProvider = createProProvider(config.pro);
const pipeline = createChatPipeline({
  store,
  proProvider,
  systemPrompt: loadSystemPrompt(SYSTEM_PROMPT_VERSION),
  promptVersion: SYSTEM_PROMPT_VERSION,
  maxOutputTokens: config.maxOutputTokens,
  logger,
});

const app = createApp({
  config,
  logger,
  store,
  pipeline,
  checkDb: () => checkDatabase(pool),
  version: pkg.version,
  authenticate,
});

// In development, listen only on this machine (no firewall prompt, not exposed to the network).
const host = config.nodeEnv === 'development' ? 'localhost' : '0.0.0.0';
const server = app.listen(config.port, host, () => {
  logger.info('server_started', {
    url: `http://localhost:${config.port}`,
    proProvider: config.pro.provider,
    proModel: proProvider.model,
    promptVersion: SYSTEM_PROMPT_VERSION,
  });
});

/** @param {string} signal */
function shutdown(signal) {
  logger.info('server_stopping', { signal });
  server.close(() => {
    Promise.resolve(pool?.end()).finally(() => process.exit(0));
  });
  // Open SSE streams could keep the server alive: force exit after a few seconds.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
