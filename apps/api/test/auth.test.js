import express from 'express';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/db/memory-store.js';
import { silentLogger } from '../src/lib/logger.js';
import { createAuthMiddleware, createFirebaseTokenVerifier } from '../src/middleware/auth.js';
import { createErrorHandler } from '../src/middleware/errors.js';

const PROJECT = 'acaia-test';

/** Our stand-in for Google's signing keys. */
let googleKey;
/** A key Google does NOT have (an attacker's). */
let attackerKey;
let jwks;

beforeAll(async () => {
  googleKey = await generateKeyPair('RS256');
  attackerKey = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(googleKey.publicKey)), kid: 'google-key-1', alg: 'RS256', use: 'sig' };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

/**
 * Signs a token shaped like a Firebase ID token.
 * @param {Record<string, unknown>} [claims]
 * @param {{ key?: CryptoKey, kid?: string, issuer?: string, audience?: string, expiresIn?: string|number, subject?: string|null }} [opts]
 */
async function firebaseToken(claims = {}, opts = {}) {
  const now = Math.floor(Date.now() / 1000);
  let jwt = new SignJWT({ auth_time: now - 60, email: 'alice@example.com', email_verified: true, name: 'Alice', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'google-key-1' })
    .setIssuer(opts.issuer ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(opts.audience ?? PROJECT)
    .setIssuedAt(now - 60)
    .setExpirationTime(opts.expiresIn ?? '1h');
  if (opts.subject !== null) jwt = jwt.setSubject(opts.subject ?? 'firebase-uid-alice');
  return jwt.sign(opts.key ?? googleKey.privateKey);
}

describe('createFirebaseTokenVerifier', () => {
  const verify = () => createFirebaseTokenVerifier({ projectId: PROJECT, jwks });

  it('accepts a valid token and returns the identity', async () => {
    const identity = await verify()(await firebaseToken({ email: 'Alice@Example.com' }));
    expect(identity).toEqual({ uid: 'firebase-uid-alice', email: 'alice@example.com', emailVerified: true, name: 'Alice' });
  });

  it.each([
    ['signed by another key', () => firebaseToken({}, { key: attackerKey.privateKey })],
    ['for another Firebase project (aud)', () => firebaseToken({}, { audience: 'other-project' })],
    ['issued by someone else (iss)', () => firebaseToken({}, { issuer: 'https://evil.example' })],
    ['expired', () => firebaseToken({}, { expiresIn: Math.floor(Date.now() / 1000) - 3600 })],
    ['without a subject (uid)', () => firebaseToken({}, { subject: null })],
    ['with auth_time in the future', () => firebaseToken({ auth_time: Math.floor(Date.now() / 1000) + 3600 })],
    ['with an unknown key id', () => firebaseToken({}, { kid: 'unknown' })],
  ])('rejects a token %s', async (_label, makeToken) => {
    await expect(verify()(await makeToken())).rejects.toThrow();
  });

  it('rejects unsigned tokens (alg "none") and garbage', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'x', aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}` })).toString('base64url');
    await expect(verify()(`${header}.${payload}.`)).rejects.toThrow();
    await expect(verify()('not-a-jwt')).rejects.toThrow();
  });
});

describe('createAuthMiddleware', () => {
  /** @param {string[]} allowedEmails */
  function appWith(allowedEmails = []) {
    const store = createMemoryStore();
    const app = express();
    app.get(
      '/private',
      createAuthMiddleware({ verifyToken: createFirebaseTokenVerifier({ projectId: PROJECT, jwks }), store, allowedEmails, logger: silentLogger }),
      (req, res) => res.json(/** @type {any} */ (req).user),
    );
    app.use(createErrorHandler(silentLogger));
    return app;
  }

  it('requires a Bearer token', async () => {
    const res = await request(appWith()).get('/private').expect(401);
    expect(res.body.error).toEqual({ code: 'unauthenticated', message: 'Faça login para continuar.' });
    await request(appWith()).get('/private').set('Authorization', 'Basic abc').expect(401);
  });

  it('rejects an invalid token with 401', async () => {
    const token = await firebaseToken({}, { key: attackerKey.privateKey });
    const res = await request(appWith()).get('/private').set('Authorization', `Bearer ${token}`).expect(401);
    expect(res.body.error.code).toBe('invalid_token');
  });

  it('creates the user on first request and reuses it afterwards', async () => {
    const app = appWith();
    const token = await firebaseToken();
    const first = await request(app).get('/private').set('Authorization', `Bearer ${token}`).expect(200);
    const second = await request(app).get('/private').set('Authorization', `Bearer ${token}`).expect(200);
    expect(first.body).toMatchObject({ authUid: 'firebase-uid-alice', email: 'alice@example.com', displayName: 'Alice' });
    expect(second.body.id).toBe(first.body.id);
  });

  it('lets in only verified e-mails from the invite list', async () => {
    const app = appWith(['alice@example.com']);
    const invited = await firebaseToken({ email: 'ALICE@example.com' });
    await request(app).get('/private').set('Authorization', `Bearer ${invited}`).expect(200);

    const stranger = await firebaseToken({ email: 'eve@example.com' }, { subject: 'uid-eve' });
    const denied = await request(app).get('/private').set('Authorization', `Bearer ${stranger}`).expect(403);
    expect(denied.body.error.code).toBe('not_invited');

    // Same address, but never verified: could be anyone who typed it at sign-up.
    const unverified = await firebaseToken({ email: 'alice@example.com', email_verified: false }, { subject: 'uid-fake' });
    const notVerified = await request(app).get('/private').set('Authorization', `Bearer ${unverified}`).expect(403);
    expect(notVerified.body.error.code).toBe('email_not_verified');
  });
});
