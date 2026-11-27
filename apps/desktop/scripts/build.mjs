// Builds everything the desktop app needs into apps/desktop/build/:
//   build/web/     the chat (Vite build in "desktop" mode: no login, API on the same origin)
//   build/server/  the API bundled into one file (esbuild) + its versioned prompts
// Then `electron .` runs it, and electron-builder packs it into AcaIA-Setup-<version>.exe.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = join(desktopDir, '..', '..');
const outDir = join(desktopDir, 'build');
const require = createRequire(import.meta.url);

/** @param {string} title */
const step = (title) => console.log(`\n▶ ${title}`);

// 0. Electron downloads its binary in an install script. Some npm setups skip install
//    scripts, so make sure the binary is there (otherwise `electron .` fails).
const electronDir = dirname(require.resolve('electron/package.json'));
if (!existsSync(join(electronDir, 'path.txt'))) {
  step('Baixando o Electron (só na primeira vez)');
  const result = spawnSync(process.execPath, [join(electronDir, 'install.js')], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 1. The chat (React), built for the desktop.
step('Gerando o site do chat (apps/web)');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const web = spawnSync(npm, ['run', 'build', '-w', 'apps/web', '--', '--outDir', join(outDir, 'web'), '--emptyOutDir'], {
  cwd: repoDir,
  stdio: 'inherit',
  shell: process.platform === 'win32', // npm.cmd needs a shell on Windows
  env: { ...process.env, VITE_APP_MODE: 'desktop' },
});
if (web.status !== 0) {
  console.error('\nFalhou o build do site. Rode `npm install` na raiz do repositório e tente de novo.');
  process.exit(web.status ?? 1);
}

// 2. The API in a single file. Dependencies (express, zod, ...) go inside the bundle, so the
//    installer does not need node_modules. `require` is recreated for CommonJS dependencies.
step('Empacotando a API (apps/api)');
const serverDir = join(outDir, 'server');
await build({
  entryPoints: [join(repoDir, 'apps', 'api', 'src', 'desktop.js')],
  outfile: join(serverDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24', // the Node.js inside Electron 45
  external: ['pg-native'], // optional native driver of `pg`, never used here
  banner: { js: "import { createRequire as __acaiaCreateRequire } from 'node:module'; const require = __acaiaCreateRequire(import.meta.url);" },
  legalComments: 'linked',
  logLevel: 'warning',
});
// The prompts are read at runtime next to the bundle (new URL('./system.v1.md', import.meta.url)).
const promptsDir = join(repoDir, 'apps', 'api', 'src', 'prompts');
for (const file of readdirSync(promptsDir).filter((name) => name.endsWith('.md'))) {
  cpSync(join(promptsDir, file), join(serverDir, file));
}

// 3. The brand font for the first-run screen (src/setup.html). Its capital I has serifs, so
//    "AçaIA" never reads "Açala" (system fonts draw I and l the same). OFL-1.1, like in the web app.
const fontFile = createRequire(join(repoDir, 'apps', 'web', 'package.json')).resolve(
  '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2',
);
mkdirSync(join(outDir, 'fonts'), { recursive: true });
cpSync(fontFile, join(outDir, 'fonts', 'atkinson-hyperlegible-next.woff2'));

step('Pronto: apps/desktop/build');
