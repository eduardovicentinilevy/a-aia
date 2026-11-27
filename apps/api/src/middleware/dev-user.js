/** Firebase-style UID of the single local user used while login is not configured. */
export const DEV_AUTH_UID = 'local-dev';

/** The single user of the desktop app (no login: it is the person's own computer). */
export const DESKTOP_USER = Object.freeze({ authUid: 'desktop-local', email: null, displayName: 'Você' });

/**
 * DEVELOPMENT AND DESKTOP ONLY: treats every request as coming from one local user, so the
 * app works without Firebase. The user is a real row in `users` (conversations need an owner).
 * On the server (production) the Firebase auth middleware is used instead (see middleware/auth.js).
 * @param {import('../db/store.js').Store} store
 * @param {{ authUid: string, email: string|null, displayName: string|null }} [profile]
 * @returns {import('express').RequestHandler}
 */
export function createDevUserMiddleware(store, profile = { authUid: DEV_AUTH_UID, email: 'dev@localhost', displayName: 'Dev local' }) {
  /** @type {Promise<import('../db/store.js').User>|null} */
  let userPromise = null;
  return async (req, _res, next) => {
    try {
      userPromise ??= store.upsertUser(profile);
      const user = await userPromise;
      /** @type {any} */ (req).user = { id: user.id, authUid: user.authUid, email: user.email, displayName: user.displayName };
      next();
    } catch (err) {
      userPromise = null; // try again on the next request (e.g. database was down)
      next(err);
    }
  };
}
