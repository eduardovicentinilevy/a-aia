import { ZodError } from 'zod';

/** An error that maps directly to an HTTP response. */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code     Stable machine-readable code.
   * @param {string} message  Message for the user (PT-BR).
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const notFound = (message = 'Não encontrado.') => new HttpError(404, 'not_found', message);

/** @type {import('express').RequestHandler} */
export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Rota não encontrada.' } });
}

/**
 * Last middleware: turns any error into a JSON response `{ error: { code, message } }`.
 * @param {import('../lib/logger.js').Logger} logger
 * @returns {import('express').ErrorRequestHandler}
 */
export function createErrorHandler(logger) {
  return (err, req, res, _next) => {
    if (res.headersSent) {
      // Too late for a JSON error (e.g. an SSE stream already started): just close it.
      logger.error('error_after_headers_sent', { path: req.path, error: err });
      res.end();
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'invalid_request',
          message: 'Dados inválidos.',
          issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        },
      });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    // Errors raised by express.json() (body-parser)
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'payload_too_large', message: 'A mensagem é grande demais.' } });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'invalid_json', message: 'O corpo da requisição não é um JSON válido.' } });
      return;
    }
    logger.error('unhandled_error', { method: req.method, path: req.path, error: err });
    res.status(500).json({ error: { code: 'internal', message: 'Erro interno. Tente de novo.' } });
  };
}
