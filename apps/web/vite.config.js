import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Reads the repo-wide .env WITHOUT side effects and returns only what the web app needs.
 *
 * Why not let Vite load it (envDir) or use Vite's loadEnv()? That file also holds the API's
 * NODE_ENV=development, and Vite would pick it up and make `vite build` ship React's slow
 * development build. Real environment variables (e.g. in CI) take priority over the file.
 */
function webEnv() {
  let fromFile = {};
  try {
    fromFile = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8'));
  } catch {
    // No .env file: use defaults.
  }
  /** @param {string} key */
  const get = (key) => process.env[key] || fromFile[key] || undefined;
  return {
    port: Number(get('WEB_PORT') ?? 5173),
    // VITE_* values are PUBLIC (they end up in the browser bundle): never put secrets here.
    apiBaseUrl: get('VITE_API_BASE_URL') ?? 'http://localhost:8080',
  };
}

export default defineConfig(() => {
  const env = webEnv();
  return {
    envDir: false,
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.apiBaseUrl),
    },
    plugins: [react()],
    server: { port: env.port, strictPort: true },
    preview: { port: env.port, strictPort: true },
    test: {
      environment: 'node',
      include: ['test/**/*.test.{js,jsx}'],
    },
  };
});
