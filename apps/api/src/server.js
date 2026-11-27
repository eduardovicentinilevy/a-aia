import { ConfigError, loadConfig } from './config.js';
import { createLogger } from './lib/logger.js';
import { startServer } from './start.js';

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
const running = await startServer(config, { logger });

/** @param {string} signal */
function shutdown(signal) {
  logger.info('server_stopping', { signal });
  running.close().finally(() => process.exit(0));
  // Safety net: never hang on shutdown.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
