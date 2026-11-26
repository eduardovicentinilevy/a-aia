// Starts the API and the web dev server side by side (works on Windows, macOS and Linux).
// Usage: npm run dev
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { upgradeEnv } from './env-upgrade.mjs';

const isWindows = process.platform === 'win32';

/** @type {{ name: string, color: string, workspace: string }[]} */
const apps = [
  { name: 'api', color: '\x1b[35m', workspace: 'apps/api' },
  { name: 'web', color: '\x1b[36m', workspace: 'apps/web' },
];

/**
 * Packages declared by a workspace that are not installed. Happens after `git pull`
 * brings new dependencies and `npm install` was not run yet.
 * @param {string} workspace
 */
function missingPackages(workspace) {
  const pkg = JSON.parse(readFileSync(`${workspace}/package.json`, 'utf8'));
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
    (name) => !existsSync(`node_modules/${name}/package.json`) && !existsSync(`${workspace}/node_modules/${name}/package.json`),
  );
}

// Fix .env values that older versions of .env.example shipped (see scripts/env-upgrade.mjs).
if (existsSync('.env')) {
  const { text, changes } = upgradeEnv(readFileSync('.env', 'utf8'));
  if (changes.length > 0) {
    writeFileSync('.env', text);
    for (const change of changes) console.log(`.env atualizado → ${change}`);
  }
}

const missing = apps.flatMap((app) => missingPackages(app.workspace));
if (missing.length > 0) {
  console.error(`\nFaltam dependências instaladas: ${missing.join(', ')}.`);
  console.error('Isso acontece depois de um "git pull" que trouxe pacotes novos. Rode:\n\n  npm install\n\ne depois "npm run dev" de novo.\n');
  process.exit(1);
}

const reset = '\x1b[0m';
const children = [];
let shuttingDown = false;

/**
 * Prefixes every line of a child stream with the app name.
 * @param {NodeJS.ReadableStream} stream
 * @param {NodeJS.WriteStream} out
 * @param {string} prefix
 */
function pipeWithPrefix(stream, out, prefix) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) out.write(`${prefix} ${line}\n`);
  });
  stream.on('end', () => {
    if (buffer) out.write(`${prefix} ${buffer}\n`);
  });
}

/**
 * Stops a child and everything it started (on Windows, killing npm alone would leave node running).
 * @param {import('node:child_process').ChildProcess} child
 */
function stop(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (isWindows) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM'); // negative pid = the child's whole process group
  } catch {
    child.kill('SIGTERM');
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) stop(child);
  setTimeout(() => process.exit(code), 1000).unref();
}

/**
 * Runs `npm run dev -w <workspace>`. When started through npm, `npm_execpath` points to npm's
 * own script, so we run it with the current node binary: no shell needed on any OS.
 * @param {string} workspace
 */
function spawnDev(workspace) {
  const options = /** @type {const} */ ({
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
    // On macOS/Linux, give each app its own process group so stop() can end npm and node together.
    // (On Windows, `detached` would open a new console window; taskkill /T handles the tree instead.)
    detached: !isWindows,
  });
  const npmCli = process.env.npm_execpath;
  if (npmCli && /\.(c|m)?js$/.test(npmCli)) {
    return spawn(process.execPath, [npmCli, 'run', 'dev', '-w', workspace], options);
  }
  // Fallback (script started with plain `node`): npm is a .cmd file on Windows and needs a shell.
  return spawn(`npm run dev -w ${workspace}`, { ...options, shell: true });
}

for (const app of apps) {
  const child = spawnDev(app.workspace);
  const prefix = `${app.color}[${app.name}]${reset}`;
  pipeWithPrefix(child.stdout, process.stdout, prefix);
  pipeWithPrefix(child.stderr, process.stderr, prefix);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${prefix} saiu com código ${code}. Encerrando os outros processos...`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
