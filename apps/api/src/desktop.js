// Entry point bundled into the Windows app (apps/desktop/scripts/build.mjs).
// The desktop app runs the API inside its own process, so it only needs these four functions.
export { ConfigError, loadConfig } from './config.js';
export { createLogger } from './lib/logger.js';
export { startServer } from './start.js';
