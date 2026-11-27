import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { silentLogger } from '../src/lib/logger.js';
import { startServer } from '../src/start.js';

/**
 * Raw HTTP request (fetch() does not let us forge the Host header).
 * @param {number} port
 * @param {{ method?: string, path?: string, headers?: Record<string, string>, body?: string }} options
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, body: string }>}
 */
function rawRequest(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('desktop mode', () => {
  /** @type {string} */
  let dir;
  /** @type {Awaited<ReturnType<typeof startServer>>} */
  let running;
  /** @type {string} */
  let host;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'acaia-desktop-'));
    const web = join(dir, 'web');
    mkdirSync(web);
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>AçaIA</title>');
    const config = loadConfig({
      ACAIA_MODE: 'desktop',
      NODE_ENV: 'production',
      PORT: '0',
      SQLITE_PATH: join(dir, 'data', 'acaia.db'),
      WEB_DIST_DIR: web,
      CORS_ORIGIN: '',
      PRO_PROVIDER: 'mock',
      LOG_LEVEL: 'silent',
    });
    running = await startServer(config, { logger: silentLogger });
    host = `127.0.0.1:${running.port}`;
  });

  afterAll(async () => {
    await running?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('listens on a free port of 127.0.0.1 and serves the web app', async () => {
    expect(running.port).toBeGreaterThan(0);
    expect(running.url).toBe(`http://${host}`);
    const res = await fetch(`${running.url}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>AçaIA</title>');
    // Plain http on 127.0.0.1: the page must not be told to upgrade to https.
    expect(res.headers.get('content-security-policy')).not.toContain('upgrade-insecure-requests');
  });

  it('uses the single local user, without login', async () => {
    const me = await (await fetch(`${running.url}/me`)).json();
    expect(me).toMatchObject({ displayName: 'Você', email: null });
  });

  it('keeps conversations in the SQLite file', async () => {
    const created = await fetch(`${running.url}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: running.url },
      body: '{}',
    });
    expect(created.status).toBe(201);
    const { conversations } = await (await fetch(`${running.url}/conversations`)).json();
    expect(conversations).toHaveLength(1);
  });

  it('refuses requests whose Host is not 127.0.0.1 (DNS rebinding)', async () => {
    const res = await rawRequest(running.port, { path: '/me', headers: { Host: `evil.example:${running.port}` } });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('forbidden_host');
  });

  it('refuses requests sent by other websites (Origin)', async () => {
    const res = await rawRequest(running.port, {
      method: 'POST',
      path: '/conversations',
      headers: { Host: host, Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('forbidden_origin');
  });

  it('accepts its own origin, with localhost too', async () => {
    const res = await rawRequest(running.port, {
      path: '/me',
      headers: { Host: `localhost:${running.port}`, Origin: `http://localhost:${running.port}` },
    });
    expect(res.status).toBe(200);
  });
});
