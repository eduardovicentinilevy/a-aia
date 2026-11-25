/** Fixed user id used while there is no login (Phase 0 only). */
export const DEV_USER_ID = 'local-dev';

/**
 * PHASE 0 ONLY: pretends every request comes from the same local user.
 * Phase 1 replaces this with the Firebase Auth middleware, which sets `req.user`
 * from a verified ID token. The routes already read `req.user.id`.
 * @type {import('express').RequestHandler}
 */
export function devUser(req, _res, next) {
  /** @type {any} */ (req).user = { id: DEV_USER_ID };
  next();
}
