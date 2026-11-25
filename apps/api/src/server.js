import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createMemoryStore } from './db/memory-store.js';
import { checkDatabase, createPool } from './db/pool.js';
import { createLogger } from './lib/logger.js';
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

// Phase 0 has no login: anyone reaching the API could spend the Pro quota.
if (config.nodeEnv === 'production') {
  console.error('Fase 0: a API ainda não tem login e não pode rodar com NODE_ENV=production.');
  process.exit(1);
}

const logger = createLogger({ level: config.logLevel });
const pool = config.databaseUrl ? createPool(config.databaseUrl, logger) : null;
const store = createMemoryStore();
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
