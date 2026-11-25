import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from './errors.js';

/**
 * Google's public keys for Firebase ID tokens (JSON Web Key Set).
 * Google rotates them regularly; jose downloads and caches them, refreshing when an unknown `kid` shows up.
 */
export const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/**
 * @typedef {object} Identity  What we trust from a verified ID token.
 * @property {string} uid            Firebase UID (`sub` claim).
 * @property {string|null} email
 * @property {boolean} emailVerified
 * @property {string|null} name
 *
 * @typedef {(token: string) => Promise<Identity>} VerifyToken
 */

/**
 * Builds a verifier for Firebase ID tokens, following Firebase's documented checks:
 * RS256 signature by one of Google's keys, iss = https://securetoken.google.com/<project>,
 * aud = <project>, not expired, issued in the past, non-empty `sub`, `auth_time` in the past.
 * @param {{ projectId: string, jwks?: Parameters<typeof jwtVerify>[1], clockToleranceSec?: number }} options
 * @returns {VerifyToken}
 */
export function createFirebaseTokenVerifier({ projectId, jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL)), clockToleranceSec = 5 }) {
  return async (token) => {
    const { payload } = await jwtVerify(token, /** @type {any} */ (jwks), {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'iat', 'exp', 'auth_time'],
      clockTolerance: clockToleranceSec,
    });
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) {
      throw Object.assign(new Error('Invalid sub claim'), { code: 'ERR_INVALID_SUB' });
    }
    if (typeof payload.auth_time !== 'number' || payload.auth_time > nowSec + clockToleranceSec) {
      throw Object.assign(new Error('Invalid auth_time claim'), { code: 'ERR_INVALID_AUTH_TIME' });
    }
    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name.slice(0, 200) : null,
    };
  };
}

/**
 * Express middleware that requires `Authorization: Bearer <Firebase ID token>`,
 * applies the invite list and loads (or creates) the user row.
 *
 * Invite list: when `allowedEmails` is not empty, only those VERIFIED e-mails get in.
 * "Verified" matters: anyone can create an e-mail/password account with someone else's
 * address, but cannot verify it without access to that inbox.
 *
 * @param {object} deps
 * @param {VerifyToken} deps.verifyToken
 * @param {import('../db/store.js').Store} deps.store
 * @param {string[]} deps.allowedEmails  Lowercase. Empty = everybody (development only; config enforces it).
 * @param {import('../lib/logger.js').Logger} deps.logger
 * @returns {import('express').RequestHandler}
 */
export function createAuthMiddleware({ verifyToken, store, allowedEmails, logger }) {
  const allowed = new Set(allowedEmails);
  // Avoids one database write per request: a user's row is refreshed at most every 10 minutes.
  /** @type {Map<string, { user: import('../db/store.js').User, until: number }>} */
  const cache = new Map();
  const CACHE_MS = 10 * 60 * 1000;

  return async (req, _res, next) => {
    try {
      const match = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(req.get('authorization') ?? '');
      if (!match) throw new HttpError(401, 'unauthenticated', 'Faça login para continuar.');

      /** @type {Identity} */
      let identity;
      try {
        identity = await verifyToken(match[1]);
      } catch (err) {
        logger.info('auth_rejected', { reason: /** @type {any} */ (err)?.code ?? 'invalid' });
        throw new HttpError(401, 'invalid_token', 'Sua sessão expirou. Entre de novo.');
      }

      if (allowed.size > 0 && !(identity.email && identity.emailVerified && allowed.has(identity.email))) {
        logger.info('auth_not_invited', { emailVerified: identity.emailVerified });
        throw new HttpError(
          403,
          identity.emailVerified ? 'not_invited' : 'email_not_verified',
          identity.emailVerified
            ? 'A AçaIA está em teste fechado e este e-mail ainda não foi convidado.'
            : 'Confirme seu e-mail pelo link que enviamos e entre de novo.',
        );
      }

      const cached = cache.get(identity.uid);
      let user = cached && cached.until > Date.now() ? cached.user : null;
      if (!user) {
        user = await store.upsertUser({ authUid: identity.uid, email: identity.email, displayName: identity.name });
        if (cache.size > 5000) cache.clear();
        cache.set(identity.uid, { user, until: Date.now() + CACHE_MS });
      }
      /** @type {any} */ (req).user = { id: user.id, authUid: user.authUid, email: user.email, displayName: user.displayName };
      next();
    } catch (err) {
      next(err);
    }
  };
}
