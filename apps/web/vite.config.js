import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Defaults for the public VITE_* values the app reads. */
const PUBLIC_DEFAULTS = {
  VITE_API_BASE_URL: 'http://localhost:8080',
  // 'desktop' = build for the Windows app (apps/desktop): no login, API on the same origin.
  VITE_APP_MODE: '',
  // Firebase web config (public by design — security comes from Firebase Auth rules and the API).
  // All empty = login disabled in development.
  VITE_FIREBASE_API_KEY: '',
  VITE_FIREBASE_AUTH_DOMAIN: '',
  VITE_FIREBASE_PROJECT_ID: '',
  VITE_FIREBASE_APP_ID: '',
};

/**
 * Reads the repo-wide .env WITHOUT side effects and returns only what the web app needs.
 *
 * Why not let Vite load it (envDir) or use Vite's loadEnv()? That file also holds the API's
 * NODE_ENV=development, and Vite would pick it up and make `vite build` ship React's slow
 * development build. Real environment variables (e.g. in CI) take priority over the file.
 */
function webEnv() {
  /** @type {Record<string, string>} */
  let fromFile = {};
  try {
    fromFile = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8'));
  } catch {
    // No .env file: use defaults.
  }
  /** @param {string} key */
  const get = (key) => process.env[key] || fromFile[key] || undefined;

  /** @type {Record<string, string>} */
  const publicVars = {};
  for (const [key, fallback] of Object.entries(PUBLIC_DEFAULTS)) publicVars[key] = get(key) ?? fallback;

  // The desktop app is one local user served by its own API: never ship the Firebase login
  // (even if the .env has it) and always call the API on the same origin.
  if (publicVars.VITE_APP_MODE === 'desktop') {
    publicVars.VITE_API_BASE_URL = 'same-origin';
    for (const key of Object.keys(publicVars)) if (key.startsWith('VITE_FIREBASE_')) publicVars[key] = '';
  }

  return { port: Number(get('WEB_PORT') ?? 5173), publicVars };
}

export default defineConfig(() => {
  const env = webEnv();
  return {
    envDir: false,
    // VITE_* values are PUBLIC (they end up in the browser bundle): never put secrets here.
    define: Object.fromEntries(
      Object.entries(env.publicVars).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
    ),
    plugins: [react()],
    server: { port: env.port, strictPort: true },
    preview: { port: env.port, strictPort: true },
    test: {
      environment: 'node',
      include: ['test/**/*.test.{js,jsx}'],
    },
  };
});
