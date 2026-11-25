import { performance } from 'node:perf_hooks';

/**
 * Logs one line per request: method, path (without query string), status and duration.
 * Bodies are never logged — they may contain personal data.
 * @param {import('../lib/logger.js').Logger} logger
 * @returns {import('express').RequestHandler}
 */
export function requestLogger(logger) {
  return (req, res, next) => {
    const start = performance.now();
    res.once('close', () => {
      logger.info('http_request', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
        completed: res.writableFinished,
      });
    });
    next();
  };
}
