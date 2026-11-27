import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  appendLogLine,
  checkApiKey,
  DEFAULT_MODEL,
  GEMINI_BASE_URL,
  isConfigured,
  readSettings,
  serverEnv,
  writeSettings,
} from '../src/settings.mjs';

/** Fake safeStorage: "encrypts" by reversing the text. */
const cipher = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (text) => Buffer.from([...text].reverse().join('')),
  decryptString: (data) => [...data.toString()].reverse().join(''),
});

const dirs = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'acaia-desktop-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('settings file', () => {
  it('gives the defaults on first run or when the file is broken', () => {
    const dir = tempDir();
    assert.deepEqual(readSettings(join(dir, 'nope.json'), cipher()), { apiKey: null, model: DEFAULT_MODEL, demo: false });
    writeFileSync(join(dir, 'broken.json'), '{not json');
    assert.equal(readSettings(join(dir, 'broken.json'), cipher()).apiKey, null);
  });

  it('never writes the key in plain text when encryption is available', () => {
    const file = join(tempDir(), 'sub', 'settings.json');
    writeSettings(file, { apiKey: 'AIzaSECRET', model: 'gemini-x', demo: false }, cipher());
    const raw = readFileSync(file, 'utf8');
    assert.ok(!raw.includes('AIzaSECRET'));
    assert.deepEqual(readSettings(file, cipher()), { apiKey: 'AIzaSECRET', model: 'gemini-x', demo: false });
  });

  it('falls back to plain text only when the system has no encryption', () => {
    const file = join(tempDir(), 'settings.json');
    writeSettings(file, { apiKey: 'k', model: DEFAULT_MODEL, demo: false }, cipher(false));
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).apiKey, 'k');
    assert.equal(readSettings(file, cipher(false)).apiKey, 'k');
  });

  it('knows when the app is ready to use', () => {
    assert.equal(isConfigured({ apiKey: null, model: DEFAULT_MODEL, demo: false }), false);
    assert.equal(isConfigured({ apiKey: 'k', model: DEFAULT_MODEL, demo: false }), true);
    assert.equal(isConfigured({ apiKey: null, model: DEFAULT_MODEL, demo: true }), true);
  });
});

describe('serverEnv', () => {
  it('runs the API in desktop mode with Gemini as the model', () => {
    const env = serverEnv({ settings: { apiKey: 'k', model: 'gemini-x', demo: false }, userDataDir: '/u', webDir: '/w' });
    assert.equal(env.ACAIA_MODE, 'desktop');
    assert.equal(env.PORT, '0');
    assert.equal(env.SQLITE_PATH, join('/u', 'acaia.db'));
    assert.equal(env.WEB_DIST_DIR, '/w');
    assert.equal(env.PRO_PROVIDER, 'openai-compatible');
    assert.equal(env.PRO_BASE_URL, GEMINI_BASE_URL);
    assert.equal(env.PRO_API_KEY, 'k');
    assert.equal(env.PRO_MODEL, 'gemini-x');
  });

  it('uses the fake model in demo mode, without any key', () => {
    const env = serverEnv({ settings: { apiKey: null, model: DEFAULT_MODEL, demo: true }, userDataDir: '/u', webDir: '/w' });
    assert.equal(env.PRO_PROVIDER, 'mock');
    assert.equal(env.PRO_API_KEY, undefined);
  });
});

describe('checkApiKey', () => {
  it('accepts a key the API recognizes', async () => {
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url, auth: init.headers.Authorization };
      return new Response('{}', { status: 200 });
    };
    assert.deepEqual(await checkApiKey({ apiKey: '  abc  ', fetchImpl }), { ok: true });
    assert.deepEqual(seen, { url: `${GEMINI_BASE_URL}/models`, auth: 'Bearer abc' });
  });

  it('explains what went wrong, in Portuguese', async () => {
    const status = (code) => async () => new Response('{}', { status: code });
    assert.match((await checkApiKey({ apiKey: '' })).message, /Cole/);
    assert.match((await checkApiKey({ apiKey: 'a b' })).message, /espaços/);
    assert.match((await checkApiKey({ apiKey: 'x', fetchImpl: status(400) })).message, /recusou/);
    assert.match((await checkApiKey({ apiKey: 'x', fetchImpl: status(429) })).message, /limitando/);
    const offline = async () => {
      throw new TypeError('fetch failed');
    };
    assert.match((await checkApiKey({ apiKey: 'x', fetchImpl: offline })).message, /internet/);
  });
});

describe('appendLogLine', () => {
  it('creates the folder and rotates big files', () => {
    const file = join(tempDir(), 'logs', 'acaia.log');
    appendLogLine(file, 'um');
    appendLogLine(file, 'dois', 2); // file already bigger than 2 bytes → rotated first
    assert.equal(readFileSync(file, 'utf8'), 'dois\n');
    assert.equal(readFileSync(`${file}.1`, 'utf8'), 'um\n');
  });
});
