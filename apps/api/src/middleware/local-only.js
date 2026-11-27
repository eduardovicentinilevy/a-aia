import { HttpError } from './errors.js';

/**
 * DESKTOP ONLY. The desktop API has no login (it is one person on their own computer), so it
 * must only answer the AçaIA window itself. It already listens on 127.0.0.1 (no other machine
 * can reach it); this guard also blocks two browser tricks:
 *   - another website open in the browser sending requests to 127.0.0.1 → its Origin header
 *     is not ours, so it is refused;
 *   - "DNS rebinding" (a malicious domain that resolves to 127.0.0.1) → the Host header is that
 *     domain instead of 127.0.0.1:<port>, so it is refused.
 * @param {() => number} getPort  The port is only known after listen() (port 0 = any free port).
 * @returns {import('express').RequestHandler}
 */
export function createLocalOnlyGuard(getPort) {
  return (req, _res, next) => {
    const port = getPort();
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host ?? '')) {
      next(new HttpError(403, 'forbidden_host', 'Acesso negado.'));
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !hosts.some((host) => origin === `http://${host}`)) {
      next(new HttpError(403, 'forbidden_origin', 'Acesso negado.'));
      return;
    }
    next();
  };
}
