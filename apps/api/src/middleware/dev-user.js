/** Firebase-style UID of the single local user used while login is not configured. */
export const DEV_AUTH_UID = 'local-dev';

/**
 * DEVELOPMENT ONLY: treats every request as coming from one local user, so the app
 * works without Firebase. The user is a real row in `users` (conversations need an owner).
 * In production the Firebase auth middleware is used instead (see middleware/auth.js).
 * @param {import('../db/store.js').Store} store
 * @returns {import('express').RequestHandler}
 */
export function createDevUserMiddleware(store) {
  /** @type {Promise<import('../db/store.js').User>|null} */
  let userPromise = null;
  return async (req, _res, next) => {
    try {
      userPromise ??= store.upsertUser({ authUid: DEV_AUTH_UID, email: 'dev@localhost', displayName: 'Dev local' });
      const user = await userPromise;
      /** @type {any} */ (req).user = { id: user.id, authUid: user.authUid, email: user.email, displayName: user.displayName };
      next();
    } catch (err) {
      userPromise = null; // try again on the next request (e.g. database was down)
      next(err);
    }
  };
}
