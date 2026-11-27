// Settings of the desktop app (model and API key) and the environment handed to the API.
// Pure functions, no Electron imports: they are tested with `node --test`.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Gemini through its OpenAI-compatible endpoint: the same "Pro" the web version uses. */
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/**
 * @typedef {object} Settings
 * @property {string|null} apiKey  Gemini API key (kept encrypted on disk when possible).
 * @property {string} model
 * @property {boolean} demo        true = no key, answers come from the fake model (MockProvider).
 */

/** @type {Settings} */
export const DEFAULT_SETTINGS = Object.freeze({ apiKey: null, model: DEFAULT_MODEL, demo: false });

/**
 * @typedef {object} Cipher  Electron's safeStorage (Windows DPAPI: only this Windows user can decrypt).
 * @property {() => boolean} isEncryptionAvailable
 * @property {(text: string) => Buffer} encryptString
 * @property {(data: Buffer) => string} decryptString
 */

/**
 * Reads settings.json. A missing or broken file gives the defaults (first run).
 * @param {string} file
 * @param {Cipher} cipher
 * @returns {Settings}
 */
export function readSettings(file, cipher) {
  if (!existsSync(file)) return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    let apiKey = null;
    if (typeof raw.apiKeyEncrypted === 'string' && cipher.isEncryptionAvailable()) {
      apiKey = cipher.decryptString(Buffer.from(raw.apiKeyEncrypted, 'base64'));
    } else if (typeof raw.apiKey === 'string') {
      apiKey = raw.apiKey;
    }
    return {
      apiKey: apiKey || null,
      model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_MODEL,
      demo: raw.demo === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Writes settings.json atomically (temp file + rename), encrypting the key when the system allows.
 * @param {string} file
 * @param {Settings} settings
 * @param {Cipher} cipher
 */
export function writeSettings(file, settings, cipher) {
  mkdirSync(dirname(file), { recursive: true });
  /** @type {Record<string, unknown>} */
  const data = { model: settings.model, demo: settings.demo };
  if (settings.apiKey) {
    if (cipher.isEncryptionAvailable()) data.apiKeyEncrypted = cipher.encryptString(settings.apiKey).toString('base64');
    else data.apiKey = settings.apiKey; // e.g. Linux without a keyring: same protection as a .env file
  }
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(temp, file);
}

/** @param {Settings} settings */
export const isConfigured = (settings) => settings.demo || Boolean(settings.apiKey);

/**
 * Environment for the embedded API (read by apps/api/src/config.js).
 * @param {{ settings: Settings, userDataDir: string, webDir: string }} input
 * @returns {Record<string, string>}
 */
export function serverEnv({ settings, userDataDir, webDir }) {
  const model = settings.demo
    ? { PRO_PROVIDER: 'mock' }
    : {
        PRO_PROVIDER: 'openai-compatible',
        PRO_BASE_URL: GEMINI_BASE_URL,
        PRO_API_KEY: /** @type {string} */ (settings.apiKey),
        PRO_MODEL: settings.model,
      };
  return {
    ACAIA_MODE: 'desktop',
    NODE_ENV: 'production',
    PORT: '0', // any free port: never clashes with something else on the computer
    SQLITE_PATH: join(userDataDir, 'acaia.db'),
    WEB_DIST_DIR: webDir,
    CORS_ORIGIN: '', // same origin only
    LOG_LEVEL: 'info',
    MODERATION_PROVIDER: 'keyword',
    // It is the person's own key and computer: no daily or monthly cap from us
    // (Google's free tier has its own limits, shown as a friendly message when hit).
    DAILY_TOKEN_LIMIT_PER_USER: '0',
    MONTHLY_BUDGET_BRL: '0',
    ...model,
  };
}

/**
 * Checks a Gemini key by listing the models (free call, no tokens spent).
 * @param {{ apiKey: string, fetchImpl?: typeof fetch, timeoutMs?: number }} input
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function checkApiKey({ apiKey, fetchImpl = fetch, timeoutMs = 10_000 }) {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: 'Cole a sua chave do Gemini.' };
  if (/\s/.test(key)) return { ok: false, message: 'A chave não pode ter espaços. Copie de novo do Google AI Studio.' };
  try {
    const response = await fetchImpl(`${GEMINI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return { ok: true };
    if ([400, 401, 403].includes(response.status)) {
      return { ok: false, message: 'O Google recusou essa chave. Confira se copiou a chave inteira.' };
    }
    if (response.status === 429) return { ok: false, message: 'O Google está limitando as chamadas agora. Tente de novo em um minuto.' };
    return { ok: false, message: `O Google respondeu com erro ${response.status}. Tente de novo.` };
  } catch {
    return { ok: false, message: 'Não consegui falar com o Google. Você está conectado à internet?' };
  }
}

/**
 * Appends one line to a log file, keeping at most ~5 MB (the previous file becomes .1).
 * @param {string} file
 * @param {string} line
 * @param {number} [maxBytes]
 */
export function appendLogLine(file, line, maxBytes = 5 * 1024 * 1024) {
  try {
    if (statSync(file).size > maxBytes) renameSync(file, `${file}.1`);
  } catch {
    mkdirSync(dirname(file), { recursive: true }); // first line ever: create the folder
  }
  appendFileSync(file, `${line}\n`);
}
